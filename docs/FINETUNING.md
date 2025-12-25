# Fine-Tuning Qwen3 for Test Automation

This guide explains how to fine-tune Qwen3 (or similar models) to improve test automation performance with the wdio-agent.

## Why Fine-Tune?

Local models like Qwen3:8b lack the "implicit reasoning" that larger models have. They may:
- Fail to dismiss cookie modals before interacting with elements
- Not recognize when a page is still loading
- Miss obvious blockers like popups or overlays

Fine-tuning teaches the model these patterns from successful examples.

---

## Prerequisites

### Hardware Requirements
- **Minimum**: 16GB RAM, GPU with 8GB VRAM (RTX 3070+)
- **Recommended**: 32GB RAM, GPU with 24GB VRAM (RTX 4090, A100)
- **Alternative**: Use cloud services (RunPod, Lambda Labs, vast.ai)

### Software Requirements
```bash
# Python 3.10+
python --version

# CUDA toolkit (for GPU training)
nvcc --version

# Install training dependencies
pip install unsloth transformers datasets peft accelerate bitsandbytes
```

---

## Step 1: Collect Training Data

The wdio-agent automatically saves successful runs to `~/.wdio-agent/training-data/`.

### Run Test Scenarios
```bash
# Run various test scenarios
wdio-agent "go to google.com and search for WebDriverIO"
wdio-agent "navigate to github.com and click on Sign in"
wdio-agent "go to amazon.com and search for laptop"
wdio-agent "visit wikipedia.org and search for artificial intelligence"
```

### Check Collected Data
```bash
# Count collected examples
ls ~/.wdio-agent/training-data/ | wc -l

# View an example
cat ~/.wdio-agent/training-data/run_*.json | head -100
```

### Export for Training
```bash
# Export to JSONL format (built-in command)
wdio-agent --export-training-data

# Output: ~/.wdio-agent/training-data/training-data.jsonl
```

---

## Step 2: Prepare Training Data

### Training Data Format

Each training example follows Qwen3's ChatML format:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a test automation agent. Before each action, you MUST reason step-by-step.\n\nTOOLS:\n- start_browser: Launch browser\n..."
    },
    {
      "role": "user",
      "content": "Complete this task: go to google.com and search for WebDriverIO"
    },
    {
      "role": "assistant",
      "content": "OBSERVE: No browser is running yet.\nBLOCKER: None.\nTHINK: I need to start the browser first before I can navigate.\nACTION: Calling start_browser",
      "tool_calls": [{
        "type": "function",
        "function": {
          "name": "start_browser",
          "arguments": "{}"
        }
      }]
    },
    {
      "role": "tool",
      "name": "start_browser",
      "content": "✓ Browser started in headed mode. Ready for navigation."
    },
    {
      "role": "assistant",
      "content": "OBSERVE: Browser is now running and ready.\nBLOCKER: None.\nTHINK: Now I should navigate to google.com.\nACTION: Calling navigate",
      "tool_calls": [{
        "type": "function",
        "function": {
          "name": "navigate",
          "arguments": "{\"url\": \"https://google.com\"}"
        }
      }]
    }
  ]
}
```

### Key Training Patterns to Include

1. **Cookie Modal Handling**
```json
{
  "role": "assistant",
  "content": "OBSERVE: Google homepage loaded. I see a cookie consent dialog with 'Reject all' and 'Accept all' buttons covering the page.\nBLOCKER: YES - Cookie consent modal is blocking the search box.\nTHINK: I must dismiss the cookie modal FIRST by clicking 'Reject all' before I can interact with the search box.\nACTION: Clicking the reject button",
  "tool_calls": [{"type": "function", "function": {"name": "click_element", "arguments": "{\"selector\": \"#W0wltc\"}"}}]
}
```

2. **Element Visibility Check**
```json
{
  "role": "assistant",
  "content": "OBSERVE: Page has loaded but I haven't checked what elements are available.\nBLOCKER: Unknown - I need to see the page state.\nTHINK: Before clicking anything, I should get the visible elements to find the correct selector.\nACTION: Getting visible elements",
  "tool_calls": [{"type": "function", "function": {"name": "get_visible_elements", "arguments": "{}"}}]
}
```

3. **Task Completion**
```json
{
  "role": "assistant",
  "content": "OBSERVE: Search results are now showing for 'WebDriverIO'. I can see multiple results including the official WebDriverIO website.\nBLOCKER: None.\nTHINK: The task was to search for WebDriverIO on Google. The search has been completed successfully.\nACTION: Marking task as complete",
  "tool_calls": [{"type": "function", "function": {"name": "task_complete", "arguments": "{\"summary\": \"Successfully searched for WebDriverIO on Google. Search results are now displayed.\"}"}}]
}
```

### Validate Training Data
```python
import json

def validate_training_file(filepath):
    """Validate training data format"""
    with open(filepath, 'r') as f:
        for i, line in enumerate(f):
            try:
                example = json.loads(line)
                assert 'messages' in example, f"Line {i}: missing 'messages'"

                for msg in example['messages']:
                    assert 'role' in msg, f"Line {i}: message missing 'role'"
                    assert 'content' in msg, f"Line {i}: message missing 'content'"

                    if msg['role'] == 'assistant' and 'tool_calls' in msg:
                        for tc in msg['tool_calls']:
                            assert 'function' in tc
                            assert 'name' in tc['function']

            except Exception as e:
                print(f"Error on line {i}: {e}")
                return False

    print(f"Validated {i+1} examples successfully")
    return True

validate_training_file('~/.wdio-agent/training-data/training-data.jsonl')
```

---

## Step 3: Fine-Tune with Unsloth (Recommended)

[Unsloth](https://github.com/unslothai/unsloth) provides 2x faster training with 60% less memory.

### Installation
```bash
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
```

### Training Script

Create `finetune_qwen3.py`:

```python
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments
import torch

# 1. Load base model
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen2.5-7B-Instruct",  # Or Qwen3 when available
    max_seq_length=4096,
    dtype=None,  # Auto-detect
    load_in_4bit=True,  # QLoRA - reduces memory
)

# 2. Add LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=16,  # LoRA rank
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

# 3. Load training data
dataset = load_dataset("json", data_files="training-data.jsonl", split="train")

# 4. Format for ChatML
def format_chat(example):
    """Convert to ChatML format that Qwen expects"""
    formatted = tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False
    )
    return {"text": formatted}

dataset = dataset.map(format_chat)

# 5. Training configuration
training_args = TrainingArguments(
    output_dir="./wdio-agent-qwen3",
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    warmup_steps=10,
    num_train_epochs=3,
    learning_rate=2e-4,
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported(),
    logging_steps=10,
    save_strategy="epoch",
    optim="adamw_8bit",
)

# 6. Train
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=4096,
    args=training_args,
)

trainer.train()

# 7. Save LoRA adapters
model.save_pretrained("wdio-agent-lora")
tokenizer.save_pretrained("wdio-agent-lora")

# 8. Merge and save full model (optional)
model.save_pretrained_merged("wdio-agent-merged", tokenizer, save_method="merged_16bit")
```

### Run Training
```bash
python finetune_qwen3.py
```

Expected output:
```
{'loss': 1.234, 'learning_rate': 0.0002, 'epoch': 1.0}
{'loss': 0.567, 'learning_rate': 0.0001, 'epoch': 2.0}
{'loss': 0.234, 'learning_rate': 0.00005, 'epoch': 3.0}
Training completed in 45 minutes
```

---

## Step 4: Convert to Ollama Format

### Option A: GGUF Conversion (Recommended)
```bash
# Install llama.cpp
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make

# Convert to GGUF
python convert_hf_to_gguf.py ../wdio-agent-merged --outfile wdio-agent.gguf --outtype q4_k_m
```

### Option B: Create Ollama Modelfile
```dockerfile
# Modelfile
FROM ./wdio-agent.gguf

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
{{ .Response }}<|im_end|>
"""

PARAMETER stop "<|im_end|>"
PARAMETER temperature 0.1
PARAMETER num_ctx 4096

SYSTEM """You are a test automation agent. Before each action, you MUST reason step-by-step.

TOOLS:
- start_browser: Launch browser (call first)
- navigate: Go to URL
- get_visible_elements: See page elements
- click_element: Click by CSS selector
- set_value: Type into input field
- press_keys: Press keys (e.g., "Enter")
- task_complete: Finish task

REASONING FORMAT:
OBSERVE: [What do I see?]
BLOCKER: [Is anything blocking my goal?]
THINK: [What should I do next?]
ACTION: [Call the appropriate tool]
"""
```

### Register with Ollama
```bash
ollama create wdio-agent -f Modelfile

# Test it
ollama run wdio-agent "Hello, are you ready for test automation?"
```

---

## Step 5: Use Fine-Tuned Model

### Update wdio-agent Configuration
```bash
# Use your fine-tuned model
wdio-agent --model wdio-agent "go to google.com and search for WebDriverIO"

# Or set as default
export WDIO_AGENT_MODEL=wdio-agent
wdio-agent "navigate to github.com"
```

---

## Training Tips

### Data Quality > Quantity
- 100 high-quality examples beat 1000 poor examples
- Each example should demonstrate correct ReAct reasoning
- Include diverse scenarios (modals, forms, navigation, search)

### Common Patterns to Train

| Pattern | Example |
|---------|---------|
| Cookie consent | Dismiss before main action |
| Login forms | Fill username, password, submit |
| Search | Type query, press Enter or click button |
| Navigation | Wait for page load, check elements |
| Modals/Popups | Identify and dismiss blockers |
| Dynamic content | Re-fetch elements after actions |

### Avoid Overfitting
- Split data: 90% train, 10% validation
- Monitor validation loss
- Stop if validation loss increases

### Memory Optimization
```python
# Use 4-bit quantization (QLoRA)
load_in_4bit=True

# Use gradient checkpointing
use_gradient_checkpointing="unsloth"

# Reduce batch size if OOM
per_device_train_batch_size=1
gradient_accumulation_steps=8
```

---

## Sharing Fine-Tuned Models

### Push to Hugging Face
```bash
# Login
huggingface-cli login

# Push LoRA adapters (small, ~50MB)
huggingface-cli upload your-org/wdio-agent-lora ./wdio-agent-lora

# Push GGUF (for Ollama, ~4GB for Q4_K_M)
huggingface-cli upload your-org/wdio-agent-gguf ./wdio-agent.gguf
```

### Share via Ollama Registry
```bash
# Tag for your organization
ollama cp wdio-agent your-org/wdio-agent

# Push to Ollama registry
ollama push your-org/wdio-agent
```

---

## Troubleshooting

### Out of Memory (OOM)
```python
# Reduce memory usage
load_in_4bit=True
per_device_train_batch_size=1
gradient_accumulation_steps=16
max_seq_length=2048  # Reduce if needed
```

### Poor Performance After Fine-Tuning
- Check training data quality
- Ensure ReAct format is consistent
- Increase training epochs (3-5)
- Adjust learning rate (try 1e-4 or 5e-5)

### Model Not Following Format
- Add more examples with correct format
- Use system prompt in Modelfile
- Lower temperature (0.1)

---

## Next Steps

1. **Collect 50+ successful runs** before fine-tuning
2. **Start with LoRA** (faster, less memory)
3. **Test on held-out scenarios** before deploying
4. **Iterate**: collect failures, add to training data, re-train
