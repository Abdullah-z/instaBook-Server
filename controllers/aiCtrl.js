const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my Gemini API key is not configured. Please check the server settings.";
      }

      const genAI = new GoogleGenerativeAI(apiKey);

      // We use gemini-1.5-flash as it is the most robust free-tier model
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Format history: [{ role: "user", parts: [{ text: "..." }] }, { role: "model", parts: [{ text: "..." }] }]
      const formattedHistory = history.map((msg) => ({
        role: msg.sender?.role === "ai_assistant" ? "model" : "user",
        parts: [{ text: msg.text || "" }],
      }));

      console.log("🤖 Requesting Gemini response...");

      const chat = model.startChat({
        history: formattedHistory,
      });

      const result = await chat.sendMessage(currentMessage);
      const text = result.response.text();

      if (text) {
        console.log("✅ Gemini success");
        return text;
      }

      return "I'm thinking, but I can't find the words right now.";
    } catch (err) {
      console.error("❌ Gemini Error:", err.message);

      if (err.message?.includes("429")) {
        return "I've hit my free-tier limit for a moment! 🧘 Please try again in 60 seconds.";
      }
      if (err.message?.includes("404")) {
        return "It looks like this model isn't active on your API key yet. Please check Google AI Studio.";
      }

      return "I'm having some trouble connecting to my brain. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
