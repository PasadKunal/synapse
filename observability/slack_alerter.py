"""
Sends a Slack alert when an anomaly is detected.
Uses an Incoming Webhook URL (free, no bot token needed).

Setup:
1. Go to api.slack.com/apps, create an app, enable Incoming Webhooks
2. Add to a channel and copy the URL
3. Set SLACK_WEBHOOK_URL in your .env

If the webhook URL is not set, alerts are logged locally and nothing breaks.
"""

import json
import os

import structlog

log = structlog.get_logger()


def send_alert(title: str, details: dict) -> None:
    """
    Send a formatted alert to Slack.
    Silently skips if SLACK_WEBHOOK_URL is not configured.
    """
    webhook_url = os.getenv("SLACK_WEBHOOK_URL", "")
    if not webhook_url:
        log.info("slack_alert_skipped", title=title, details=details)
        return

    try:
        import httpx

        detail_lines = "\n".join(f"• *{k}*: `{v}`" for k, v in details.items())
        payload = {
            "text": f":warning: *{title}*\n{detail_lines}"
        }

        response = httpx.post(
            webhook_url,
            content=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            timeout=5.0,
        )
        response.raise_for_status()
        log.info("slack_alert_sent", title=title)

    except Exception as exc:
        log.warning("slack_alert_failed", title=title, error=str(exc))
