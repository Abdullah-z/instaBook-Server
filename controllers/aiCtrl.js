const OpenAI = require("openai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my ChatGPT API key is not configured. Please check the server settings.";
      }

      const openai = new OpenAI({ apiKey });

      // Format history for OpenAI
      // Roles: 'system', 'user', 'assistant'
      const messages = [
        {
          role: "system",
          content:
            "You are a helpful AI Assistant in a social media app called Instabook. Keep your responses concise, friendly, and helpful.",
        },
        ...history.map((msg) => ({
          role: msg.sender?.role === "ai_assistant" ? "assistant" : "user",
          content: msg.text,
        })),
        { role: "user", content: currentMessage },
      ];

      console.log("🤖 Requesting ChatGPT response...");

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Very fast and reliable fallback
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const aiText = response.choices[0]?.message?.content;

      if (aiText) {
        console.log("✅ ChatGPT success");
        return aiText;
      }

      return "I'm having a hard time thinking right now. Please try again.";
    } catch (err) {
      console.error("❌ OpenAI API Error:", err.message);
      if (err.message?.includes("429")) {
        return "I'm a bit busy right now (rate limit). Please try again in a few seconds!";
      }
      return "I couldn't connect to my ChatGPT brain. Please ensure OPENAI_API_KEY is correct in your settings.";
    }
  },
};

module.exports = aiCtrl;
