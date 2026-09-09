# ============================================================
# NexaDesk AI Server -- Google Colab Free GPU Setup
# ============================================================
# Copy this entire script into a Google Colab notebook cell
# and click "Runtime -> Run All" to start your free AI server.
#
# Prerequisites: Free Google account with Colab access.
# GPU: Uses Colab's free T4 GPU (no payment required).
# ============================================================

# Step 1: Install dependencies
print("[INFO] Installing dependencies...")
# !pip install -q vllm ngrok flask flask-cors transformers torch

# Step 2: Simple Flask-based OpenAI-compatible server
# (Using transformers for broad compatibility on Colab free tier)

INSTALL_CMD = """
pip install -q flask flask-cors pyngrok transformers torch accelerate
"""

SERVER_CODE = '''
import os, json, threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

app = Flask(__name__)
CORS(app)

MODEL_NAME = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
print(f"[INFO] Loading model: {MODEL_NAME}...")

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.float16,
    device_map="auto",
    trust_remote_code=True
)
print("[SUCCESS] Model loaded successfully!")

@app.route("/v1/chat/completions", methods=["POST"])
def chat_completions():
    data = request.json
    messages = data.get("messages", [])

    # Build prompt from messages
    prompt_parts = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            prompt_parts.append(f"System: {content}")
        elif role == "user":
            prompt_parts.append(f"User: {content}")
        elif role == "assistant":
            prompt_parts.append(f"Assistant: {content}")
    prompt_parts.append("Assistant:")
    full_prompt = "\\n\\n".join(prompt_parts)

    inputs = tokenizer(full_prompt, return_tensors="pt", truncation=True, max_length=4096).to(model.device)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=0.7,
            top_p=0.9,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )
    response_text = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    return jsonify({
        "choices": [{
            "message": {
                "role": "assistant",
                "content": response_text
            },
            "index": 0,
            "finish_reason": "stop"
        }],
        "model": MODEL_NAME
    })

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
'''

print("=" * 60)
print("  NexaDesk AI Server -- Google Colab Setup")
print("=" * 60)
print()
print("INSTRUCTIONS:")
print("1. Run this cell in Google Colab (with GPU runtime)")
print("2. Copy the ngrok URL printed below")
print("3. Paste it into NexaDesk IDE -> Code Assistant -> Colab provider")
print()
print("Installing packages...")

import subprocess, sys
subprocess.check_call([sys.executable, "-m", "pip", "install", "-q",
    "flask", "flask-cors", "pyngrok", "transformers", "torch", "accelerate"])

print("[SUCCESS] Packages installed!")
print()
print("To start the server, run the next cell with:")
print('  exec(SERVER_CODE)')
print()
print("Then in another cell, start ngrok:")
print('  from pyngrok import ngrok')
print('  ngrok.set_auth_token("YOUR_NGROK_TOKEN")  # Get free at ngrok.com')
print('  public_url = ngrok.connect(5000)')
print('  print(f"[ONLINE] Your NexaDesk AI URL: {public_url}/v1/chat/completions")')

