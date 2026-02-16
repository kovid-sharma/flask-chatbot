/**
 * AssistBot — Professional Chatbot Flow Engine
 *
 * Fetches chatbot steps from /api/config, renders them as a
 * conversational flow with timestamps, and submits to /api/submit.
 * Manages chat history in the sidebar — first user selection becomes
 * the chat title.
 */

(function () {
    "use strict";

    const chatMessages = document.getElementById("chatMessages");
    const chatInputArea = document.getElementById("chatInputArea");
    const userInput = document.getElementById("userInput");
    const sendBtn = document.getElementById("sendBtn");
    const resetBtn = document.getElementById("resetBtn");
    const menuBtn = document.getElementById("menuBtn");
    const sidebar = document.querySelector(".sidebar");
    const chatHistoryList = document.getElementById("chatHistoryList");
    const newChatSidebarBtn = document.getElementById("newChatSidebarBtn");
    const newChatHeaderBtn = document.getElementById("newChatHeaderBtn");

    let config = null;
    let currentStep = 0;
    let selections = {};
    let awaitingOtherInput = false;
    let otherStepId = null;

    // ───────────────────────────────────────────────────────────
    // Chat History State
    // ───────────────────────────────────────────────────────────

    let chatHistory = [];   // [{ id, title, selections, customMessage, messages }]
    let activeChatId = null;

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /** Create a brand-new chat entry (does NOT start conversation yet). */
    function createNewChat() {
        const chat = {
            id: generateId(),
            title: "New Chat",
            selections: {},
            customMessage: "",
            messages: [],          // saved DOM innerHTML for switching back
            completed: false
        };
        chatHistory.unshift(chat); // add to top
        activeChatId = chat.id;
        renderChatHistory();
        return chat;
    }

    /** Update the title of the active chat to the first user selection. */
    function setActiveChatTitle(title) {
        const chat = chatHistory.find(c => c.id === activeChatId);
        if (chat && chat.title === "New Chat") {
            chat.title = title;
            renderChatHistory();
        }
    }

    /** Render the sidebar chat history list. */
    function renderChatHistory() {
        chatHistoryList.innerHTML = "";
        chatHistory.forEach(chat => {
            const item = document.createElement("button");
            item.classList.add("chat-history-item");
            if (chat.id === activeChatId) item.classList.add("active");

            item.innerHTML =
                '<svg class="chat-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
                '</svg>' +
                '<span class="chat-title">' + escapeHtml(chat.title) + '</span>';

            item.addEventListener("click", () => switchToChat(chat.id));
            chatHistoryList.appendChild(item);
        });
    }

    function escapeHtml(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    /** Save current chat's DOM state before switching away. */
    function saveCurrentChat() {
        const chat = chatHistory.find(c => c.id === activeChatId);
        if (chat) {
            chat.messages = chatMessages.innerHTML;
            chat.selections = { ...selections };
        }
    }

    /** Switch to an existing chat by id. */
    function switchToChat(id) {
        if (id === activeChatId) return;

        // Save current
        saveCurrentChat();

        // Load target
        activeChatId = id;
        const chat = chatHistory.find(c => c.id === id);
        if (!chat) return;

        chatMessages.innerHTML = chat.messages || "";
        selections = { ...chat.selections };

        // Hide input area if chat is completed or not awaiting custom input
        chatInputArea.style.display = "none";
        awaitingOtherInput = false;
        otherStepId = null;

        renderChatHistory();
        scrollToBottom();
    }

    // ───────────────────────────────────────────────────────────
    // New Chat action
    // ───────────────────────────────────────────────────────────

    function startNewChat() {
        // Save the current chat first
        if (activeChatId) saveCurrentChat();

        // Reset conversation state
        currentStep = 0;
        selections = {};
        awaitingOtherInput = false;
        otherStepId = null;
        chatInputArea.style.display = "none";
        userInput.value = "";
        chatMessages.innerHTML = "";

        // Create and activate new chat
        createNewChat();

        // Start conversation
        startConversation();
    }

    // ───────────────────────────────────────────────────────────
    // Helpers
    // ───────────────────────────────────────────────────────────

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    function timeNow() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function hideWelcome() {
        const ws = document.getElementById("welcomeState");
        if (ws && ws.parentNode) {
            ws.style.opacity = "0";
            ws.style.transition = "opacity 0.3s";
            setTimeout(() => ws.remove(), 300);
        }
    }

    // ───────────────────────────────────────────────────────────
    // Message Rendering
    // ───────────────────────────────────────────────────────────

    function addMessage(text, sender) {
        hideWelcome();

        const row = document.createElement("div");
        row.classList.add("message-row", sender);

        const avatar = document.createElement("div");
        avatar.classList.add("msg-avatar");
        avatar.textContent = sender === "bot" ? "A" : "U";

        const content = document.createElement("div");
        content.classList.add("msg-content");

        const senderLabel = document.createElement("span");
        senderLabel.classList.add("msg-sender");
        senderLabel.textContent = sender === "bot" ? "AssistBot" : "You";

        const bubble = document.createElement("div");
        bubble.classList.add("msg-bubble");
        bubble.textContent = text;

        const time = document.createElement("span");
        time.classList.add("msg-time");
        time.textContent = timeNow();

        content.appendChild(senderLabel);
        content.appendChild(bubble);
        content.appendChild(time);

        row.appendChild(avatar);
        row.appendChild(content);
        chatMessages.appendChild(row);
        scrollToBottom();
    }

    function showTypingThen(callback, delay = 700) {
        const indicator = document.createElement("div");
        indicator.classList.add("typing-row");
        indicator.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        chatMessages.appendChild(indicator);
        scrollToBottom();

        setTimeout(() => {
            indicator.remove();
            callback();
        }, delay);
    }

    // ───────────────────────────────────────────────────────────
    // Option Rendering
    // ───────────────────────────────────────────────────────────

    function renderOptions(step) {
        const container = document.createElement("div");
        container.classList.add("options-container");

        const label = document.createElement("div");
        label.classList.add("options-label");
        label.textContent = "Choose an option";

        const grid = document.createElement("div");
        grid.classList.add("options-grid");

        step.options.forEach(optText => {
            const btn = document.createElement("button");
            btn.classList.add("option-btn");
            btn.textContent = optText;
            btn.addEventListener("click", () => handleOptionClick(step.id, optText, container));
            grid.appendChild(btn);
        });

        const otherBtn = document.createElement("button");
        otherBtn.classList.add("option-btn", "other-btn");
        otherBtn.textContent = "✏️ Other";
        otherBtn.addEventListener("click", () => handleOtherClick(step.id, container));
        grid.appendChild(otherBtn);

        container.appendChild(label);
        container.appendChild(grid);
        chatMessages.appendChild(container);
        scrollToBottom();
    }

    function disableButtons(container) {
        container.querySelectorAll("button").forEach(b => { b.disabled = true; });
    }

    function handleOptionClick(stepId, value, container) {
        disableButtons(container);
        selections[stepId] = value;
        addMessage(value, "user");

        // First user selection becomes the chat title
        if (currentStep === 0) setActiveChatTitle(value);

        currentStep++;
        proceedToNextStep();
    }

    function handleOtherClick(stepId, container) {
        disableButtons(container);
        awaitingOtherInput = true;
        otherStepId = stepId;
        chatInputArea.style.display = "block";
        userInput.placeholder = "Type your custom option…";
        userInput.value = "";
        userInput.focus();
        scrollToBottom();
    }

    // ───────────────────────────────────────────────────────────
    // Step Progression
    // ───────────────────────────────────────────────────────────

    function proceedToNextStep() {
        if (currentStep < config.steps.length) {
            const step = config.steps[currentStep];
            showTypingThen(() => {
                addMessage(step.prompt, "bot");
                renderOptions(step);
            });
        } else {
            showFinalPrompt();
        }
    }

    function showFinalPrompt() {
        showTypingThen(() => {
            addMessage(config.final_prompt || "Anything else you'd like to add?", "bot");

            const box = document.createElement("div");
            box.classList.add("final-box");

            const textarea = document.createElement("textarea");
            textarea.classList.add("final-textarea");
            textarea.placeholder = "Type your additional message here (optional)…";
            textarea.id = "finalMessage";

            const submitBtn = document.createElement("button");
            submitBtn.classList.add("submit-btn");
            submitBtn.innerHTML =
                'Submit ' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
                '</svg>';
            submitBtn.addEventListener("click", handleSubmit);

            box.appendChild(textarea);
            box.appendChild(submitBtn);
            chatMessages.appendChild(box);
            scrollToBottom();
        });
    }

    // ───────────────────────────────────────────────────────────
    // Submit
    // ───────────────────────────────────────────────────────────

    async function handleSubmit() {
        const textarea = document.getElementById("finalMessage");
        const customMessage = textarea ? textarea.value.trim() : "";

        const btn = document.querySelector(".submit-btn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Analysing…";
        }

        if (customMessage) {
            addMessage(customMessage, "user");
        }

        // Show typing indicator while waiting for AI
        const thinkingRow = document.createElement("div");
        thinkingRow.classList.add("typing-row");
        thinkingRow.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        chatMessages.appendChild(thinkingRow);
        scrollToBottom();

        try {
            const res = await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selections, custom_message: customMessage })
            });
            const data = await res.json();

            thinkingRow.remove();
            addMessage(data.message, "bot");
        } catch (err) {
            thinkingRow.remove();
            addMessage("⚠️ Something went wrong. Please try again later.", "bot");
            console.error("Submit error:", err);
        }

        // Mark chat as completed
        const chat = chatHistory.find(c => c.id === activeChatId);
        if (chat) chat.completed = true;
    }

    // ───────────────────────────────────────────────────────────
    // Text Input (for "Other")
    // ───────────────────────────────────────────────────────────

    function handleInputSend() {
        const value = userInput.value.trim();
        if (!value) return;

        if (awaitingOtherInput && otherStepId) {
            selections[otherStepId] = value;
            addMessage(value, "user");

            // First user input becomes the chat title
            if (currentStep === 0) setActiveChatTitle(value);

            awaitingOtherInput = false;
            otherStepId = null;
            chatInputArea.style.display = "none";
            userInput.value = "";

            currentStep++;
            proceedToNextStep();
        }
    }

    sendBtn.addEventListener("click", handleInputSend);
    userInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleInputSend();
        }
    });

    // ───────────────────────────────────────────────────────────
    // Reset (restarts current chat)
    // ───────────────────────────────────────────────────────────

    resetBtn.addEventListener("click", () => {
        currentStep = 0;
        selections = {};
        awaitingOtherInput = false;
        otherStepId = null;
        chatInputArea.style.display = "none";
        userInput.value = "";
        chatMessages.innerHTML = "";

        // Reset active chat title
        const chat = chatHistory.find(c => c.id === activeChatId);
        if (chat) {
            chat.title = "New Chat";
            chat.completed = false;
            renderChatHistory();
        }

        startConversation();
    });

    // ───────────────────────────────────────────────────────────
    // New Chat buttons
    // ───────────────────────────────────────────────────────────

    newChatSidebarBtn.addEventListener("click", startNewChat);
    newChatHeaderBtn.addEventListener("click", startNewChat);

    // ───────────────────────────────────────────────────────────
    // Mobile sidebar toggle
    // ───────────────────────────────────────────────────────────

    menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
        if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== menuBtn) {
            sidebar.classList.remove("open");
        }
    });

    // ───────────────────────────────────────────────────────────
    // Start conversation flow
    // ───────────────────────────────────────────────────────────

    function startConversation() {
        showTypingThen(() => {
            addMessage(config.greeting || "Hello! Let me help you.", "bot");

            if (config.steps && config.steps.length > 0) {
                setTimeout(() => {
                    const step = config.steps[0];
                    showTypingThen(() => {
                        addMessage(step.prompt, "bot");
                        renderOptions(step);
                    });
                }, 400);
            }
        }, 900);
    }

    // ───────────────────────────────────────────────────────────
    // Init
    // ───────────────────────────────────────────────────────────

    async function init() {
        try {
            const res = await fetch("/api/config");
            config = await res.json();
        } catch (err) {
            addMessage("⚠️ Failed to load chatbot configuration.", "bot");
            console.error("Config fetch error:", err);
            return;
        }

        // Create the first chat
        createNewChat();
        startConversation();
    }

    init();
})();
