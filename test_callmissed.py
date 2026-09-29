import os
import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("CALLMISSED_API_KEY")

url = "https://api.callmissed.com/v1/chat/completions"

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

data = {
    "model": "gpt-oss-120b",
    "messages": [
        {
            "role": "user",
            "content": "Say hello in one sentence."
        }
    ]
}

response = requests.post(
    url,
    headers=headers,
    json=data,
    timeout=30
)

print("STATUS:", response.status_code)

result = response.json()

answer = result["choices"][0]["message"]["content"]

print("AI:", answer)