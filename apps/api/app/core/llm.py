import json
from collections.abc import Generator

from httpx import Client, ConnectError, HTTPStatusError, ReadTimeout

from app.core.config import settings


class LLMError(Exception):
    pass


PROVIDER_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
    "anthropic": "https://api.anthropic.com/v1",
}

ANTHROPIC_VERSION = "2023-06-01"


def _resolve_config(
    provider: str | None,
    model_name: str | None,
    api_key: str | None,
) -> tuple[str, str, str | None]:
    """Resolve provider / model / api_key with fallback to global defaults."""
    provider = (provider or "").strip().lower() or "ollama"
    model = model_name or settings.chat_model
    key = api_key or None
    return provider, model, key


def _build_openai_messages(system_prompt: str, user_message: str) -> list[dict]:
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# ---------------------------------------------------------------------------
# Ollama (native chat API)
# ---------------------------------------------------------------------------

def _chat_ollama(
    model: str,
    messages: list[dict],
    stream: bool,
) -> dict | Generator[tuple[str, bool], None, None]:
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "options": {"temperature": settings.llm_temperature},
    }

    try:
        with Client(
            base_url=settings.ollama_base_url,
            timeout=settings.ollama_timeout,
        ) as client:
            if not stream:
                resp = client.post("/api/chat", json=payload)
                resp.raise_for_status()
                return resp.json()
            else:
                with client.stream("POST", "/api/chat", json=payload) as resp:
                    resp.raise_for_status()
                    for line in resp.iter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            yield data.get("message", {}).get("content", ""), data.get("done", False)
                        except json.JSONDecodeError:
                            continue
    except ConnectError:
        raise LLMError("Ollama is not reachable")
    except ReadTimeout:
        raise LLMError("Ollama request timed out")
    except HTTPStatusError as exc:
        raise LLMError(f"Ollama chat failed: {exc.response.text}")


# ---------------------------------------------------------------------------
# OpenAI‑compatible (OpenAI / DeepSeek / Google)
# ---------------------------------------------------------------------------

def _chat_openai_compatible(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    stream: bool,
) -> dict | Generator[tuple[str, bool], None, None]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "temperature": settings.llm_temperature,
    }

    try:
        with Client(base_url=base_url, timeout=settings.ollama_timeout) as client:
            if not stream:
                resp = client.post("/chat/completions", json=payload, headers=headers)
                resp.raise_for_status()
                return resp.json()
            else:
                with client.stream("POST", "/chat/completions", json=payload, headers=headers) as resp:
                    resp.raise_for_status()
                    for line in resp.iter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            finish = data.get("choices", [{}])[0].get("finish_reason")
                            done = finish is not None and finish != ""
                            yield content, done
                        except json.JSONDecodeError:
                            continue
    except ConnectError:
        raise LLMError(f"LLM provider at {base_url} is not reachable")
    except ReadTimeout:
        raise LLMError("LLM request timed out")
    except HTTPStatusError as exc:
        raise LLMError(f"LLM chat failed: {exc.response.text}")


# ---------------------------------------------------------------------------
# Anthropic (Messages API)
# ---------------------------------------------------------------------------

def _chat_anthropic(
    api_key: str,
    model: str,
    system_prompt: str,
    user_message: str,
    stream: bool,
) -> dict | Generator[tuple[str, bool], None, None]:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
        "max_tokens": 4096,
        "temperature": settings.llm_temperature,
        "stream": stream,
    }

    try:
        with Client(
            base_url=PROVIDER_BASE_URLS["anthropic"],
            timeout=settings.ollama_timeout,
        ) as client:
            if not stream:
                resp = client.post("/messages", json=payload, headers=headers)
                resp.raise_for_status()
                return resp.json()
            else:
                with client.stream("POST", "/messages", json=payload, headers=headers) as resp:
                    resp.raise_for_status()
                    for line in resp.iter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        try:
                            data = json.loads(line[6:])
                            if data.get("type") == "content_block_delta":
                                text = data.get("delta", {}).get("text", "")
                                yield text, False
                            elif data.get("type") == "message_stop":
                                yield "", True
                        except json.JSONDecodeError:
                            continue
    except ConnectError:
        raise LLMError("Anthropic API is not reachable")
    except ReadTimeout:
        raise LLMError("Anthropic request timed out")
    except HTTPStatusError as exc:
        raise LLMError(f"Anthropic chat failed: {exc.response.text}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _do_chat(
    provider: str,
    model: str,
    api_key: str | None,
    system_prompt: str,
    user_message: str,
    stream: bool,
) -> dict | Generator[tuple[str, bool], None, None]:
    provider, model, api_key = _resolve_config(provider, model, api_key)

    if provider == "ollama":
        return _chat_ollama(model, _build_openai_messages(system_prompt, user_message), stream)

    if provider == "anthropic":
        if not api_key:
            raise LLMError("API key is required for Anthropic")
        return _chat_anthropic(api_key, model, system_prompt, user_message, stream)

    # OpenAI-compatible: openai, deepseek, google
    base_url = PROVIDER_BASE_URLS.get(provider)
    if not base_url:
        raise LLMError(f"Unknown provider: {provider}")
    if not api_key:
        raise LLMError(f"API key is required for {provider}")
    return _chat_openai_compatible(
        base_url, api_key, model,
        _build_openai_messages(system_prompt, user_message), stream,
    )


def generate_chat_response(
    system_prompt: str,
    user_message: str,
    provider: str | None = None,
    model_name: str | None = None,
    api_key: str | None = None,
) -> str:
    result = _do_chat(provider, model_name, api_key, system_prompt, user_message, stream=False)
    assert isinstance(result, dict)

    provider_resolved, _, _ = _resolve_config(provider, model_name, api_key)

    if provider_resolved == "ollama":
        return result["message"]["content"]
    if provider_resolved == "anthropic":
        content = result.get("content", [])
        if content and isinstance(content, list):
            return "".join(block.get("text", "") for block in content if block.get("type") == "text")
        raise LLMError("Anthropic response missing content blocks")
    # OpenAI-compatible
    return result["choices"][0]["message"]["content"]


def stream_chat_response(
    system_prompt: str,
    user_message: str,
    provider: str | None = None,
    model_name: str | None = None,
    api_key: str | None = None,
) -> Generator[tuple[str, bool], None, None]:
    yield from _do_chat(provider, model_name, api_key, system_prompt, user_message, stream=True)
