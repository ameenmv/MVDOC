<template>
  <div class="chat-widget">
    <!-- Toggle Button -->
    <button
      class="chat-toggle"
      @click="isOpen = !isOpen"
      :aria-label="isOpen ? 'Close chat' : 'Ask your docs'"
    >
      <span v-if="!isOpen">💬</span>
      <span v-else>✕</span>
    </button>

    <!-- Chat Panel -->
    <Transition name="chat-panel">
      <div v-if="isOpen" class="chat-panel">
        <div class="chat-header">
          <h3>💬 Ask Your Docs</h3>
          <span class="chat-subtitle">AI-powered documentation assistant</span>
        </div>

        <div class="chat-messages" ref="messagesRef">
          <div
            v-for="(msg, i) in messages"
            :key="i"
            :class="['chat-message', msg.role]"
          >
            <div class="message-content" v-html="renderMarkdown(msg.content)"></div>
            <div v-if="msg.sources && msg.sources.length" class="message-sources">
              <details>
                <summary>📎 Sources ({{ msg.sources.length }})</summary>
                <ul>
                  <li v-for="src in msg.sources" :key="src.file">
                    {{ src.file }} > {{ src.section }}
                  </li>
                </ul>
              </details>
            </div>
          </div>

          <div v-if="isLoading" class="chat-message assistant">
            <div class="message-content loading">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>

          <div v-if="messages.length === 0 && !isLoading" class="chat-empty">
            <p>Ask anything about this project!</p>
            <div class="suggestions">
              <button @click="askSuggestion('What is this project about?')">
                What is this project about?
              </button>
              <button @click="askSuggestion('Show me the architecture')">
                Show me the architecture
              </button>
              <button @click="askSuggestion('What are the main modules?')">
                What are the main modules?
              </button>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <input
            v-model="input"
            @keydown.enter="sendMessage"
            placeholder="Ask about this project..."
            :disabled="isLoading"
          />
          <button @click="sendMessage" :disabled="isLoading || !input.trim()">
            ➤
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';

const RAG_API = 'http://localhost:3456';

const isOpen = ref(false);
const input = ref('');
const messages = ref([]);
const isLoading = ref(false);
const messagesRef = ref(null);

async function sendMessage() {
  const question = input.value.trim();
  if (!question || isLoading.value) return;

  // Add user message
  messages.value.push({ role: 'user', content: question });
  input.value = '';
  isLoading.value = true;

  await scrollToBottom();

  try {
    const response = await fetch(`${RAG_API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        history: messages.value.slice(-6).map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) throw new Error('API error');

    const data = await response.json();

    messages.value.push({
      role: 'assistant',
      content: data.answer,
      sources: data.sources,
    });
  } catch (err) {
    messages.value.push({
      role: 'assistant',
      content: '⚠️ Could not connect to the chat server. Make sure `mvdoc chat --serve` is running.',
    });
  }

  isLoading.value = false;
  await scrollToBottom();
}

function askSuggestion(question) {
  input.value = question;
  sendMessage();
}

async function scrollToBottom() {
  await nextTick();
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
}

function renderMarkdown(text) {
  // Simple markdown rendering (bold, code, links)
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
}
</script>

<style scoped>
.chat-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  font-family: var(--vp-font-family-base);
}

.chat-toggle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--vp-c-brand-1);
  color: white;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s ease, background-color 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-toggle:hover {
  transform: scale(1.1);
  background: var(--vp-c-brand-2);
}

.chat-panel {
  position: absolute;
  bottom: 72px;
  right: 0;
  width: 400px;
  max-height: 600px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  padding: 16px 20px;
  background: var(--vp-c-brand-1);
  color: white;
}

.chat-header h3 {
  margin: 0;
  font-size: 16px;
}

.chat-subtitle {
  font-size: 12px;
  opacity: 0.8;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 300px;
  max-height: 400px;
}

.chat-message {
  margin-bottom: 12px;
  max-width: 85%;
}

.chat-message.user {
  margin-left: auto;
}

.chat-message.user .message-content {
  background: var(--vp-c-brand-1);
  color: white;
  border-radius: 12px 12px 2px 12px;
  padding: 10px 14px;
}

.chat-message.assistant .message-content {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border-radius: 12px 12px 12px 2px;
  padding: 10px 14px;
}

.chat-message.assistant .message-content code {
  background: var(--vp-c-bg-mute);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.message-sources {
  margin-top: 6px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.message-sources details summary {
  cursor: pointer;
}

.message-sources ul {
  margin: 4px 0 0;
  padding-left: 16px;
}

.chat-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--vp-c-text-3);
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.suggestions button {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--vp-c-text-2);
  transition: all 0.2s;
}

.suggestions button:hover {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.chat-input-area input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 14px;
  outline: none;
}

.chat-input-area input:focus {
  border-color: var(--vp-c-brand-1);
}

.chat-input-area button {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: white;
  font-size: 16px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.chat-input-area button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Loading animation */
.loading {
  display: flex;
  gap: 6px;
  padding: 12px 16px !important;
}

.dot {
  width: 8px;
  height: 8px;
  background: var(--vp-c-text-3);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.16s; }
.dot:nth-child(3) { animation-delay: 0.32s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-8px); }
}

/* Transitions */
.chat-panel-enter-active { animation: slideUp 0.3s ease-out; }
.chat-panel-leave-active { animation: slideUp 0.2s ease-in reverse; }

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 768px) {
  .chat-panel {
    width: calc(100vw - 32px);
    right: -8px;
    bottom: 64px;
  }
}
</style>
