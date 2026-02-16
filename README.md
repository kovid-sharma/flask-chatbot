mport os
import yaml
from datetime import datetime
from flask import Flask, render_template, jsonify, request
from openai import OpenAI

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")

# Set your OpenAI API key via environment variable:
#   export OPENAI_API_KEY="sk-..."
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


def load_config():
    """Read and return the YAML config file."""
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Serve the chatbot frontend."""
    return render_template("index.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    """Return the chatbot steps and messages as JSON."""
    config = load_config()
    return jsonify(config)


@app.route("/api/submit", methods=["POST"])
def submit():
    """
    Receive the user's selections and custom message, send them to
    OpenAI for analysis, and return the AI's response.
    """
    data = request.get_json(force=True)

    selections = data.get("selections", {})
    custom_message = data.get("custom_message", "")

    # Log the submission
    print("\n" + "=" * 60)
    print(f"  NEW CHATBOT SUBMISSION — {datetime.now().isoformat()}")
    print("=" * 60)
    for step_id, value in selections.items():
        print(f"  {step_id}: {value}")
    if custom_message:
        print(f"  custom_message: {custom_message}")
    print("=" * 60 + "\n")

    # ---- Build the prompt for OpenAI ----
    config = load_config()
    step_map = {s["id"]: s["prompt"] for s in config.get("steps", [])}

    user_summary_lines = []
    for step_id, value in selections.items():
        question = step_map.get(step_id, step_id)
        user_summary_lines.append(f"- {question}  →  {value}")
    if custom_message:
        user_summary_lines.append(f"- Additional message: {custom_message}")

    user_summary = "\n".join(user_summary_lines)

    system_prompt = (
        "You are a helpful, professional customer-support AI assistant. "
        "A user has just filled out a guided chatbot form. Below are their "
        "selections and any additional message they provided. "
        "Analyse the information, acknowledge their request clearly, "
        "and provide a helpful, concise response. If follow-up is needed, "
        "mention what the next steps would be."
    )

    user_prompt = (
        f"Here are the user's chatbot responses:\n\n"
        f"{user_summary}\n\n"
        f"Please analyse and respond."
    )

    # ---- Call OpenAI ----
    try:
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=500,
        )
        ai_response = completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"  [OpenAI ERROR] {e}")
        ai_response = (
            "Thank you for your submission! We've recorded your request "
            "and our team will get back to you shortly."
        )

    print(f"  [AI Response] {ai_response}\n")

    return jsonify({
        "status": "success",
        "message": ai_response,
    })


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
