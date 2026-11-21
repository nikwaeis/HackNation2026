"""GUGiK NMT WCS retry: a single stalled request must not drop the slope from the report."""

import httpx

from conftest import request_body, tilted_aaigrid


def test_nmt_timeout_then_success_is_retried(client, upstream):
    calls = {"n": 0}

    def nmt(request: httpx.Request):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ReadTimeout("stalled", request=request)
        return httpx.Response(200, text=tilted_aaigrid(dict(request.url.params)))

    upstream.nmt = nmt
    j = client.post("/extract-geo", json=request_body()).json()
    assert calls["n"] == 2
    assert j["terrain"]["status"] == "OK"
    assert j["mean_slope_deg"] is not None


def test_nmt_two_timeouts_give_error_not_hang(client, upstream):
    calls = {"n": 0}

    def nmt(request: httpx.Request):
        calls["n"] += 1
        raise httpx.ReadTimeout("stalled", request=request)

    upstream.nmt = nmt
    j = client.post("/extract-geo", json=request_body()).json()
    assert calls["n"] == 2  # exactly one retry
    assert j["terrain"]["status"] == "ERROR" and "timed out" in j["terrain"]["error_reason"]
    assert j["mean_slope_deg"] is None


def test_nmt_http_error_is_not_retried(client, upstream):
    calls = {"n": 0}

    def nmt(request: httpx.Request):
        calls["n"] += 1
        return httpx.Response(500, text="boom")

    upstream.nmt = nmt
    client.post("/extract-geo", json=request_body())
    assert calls["n"] == 1
