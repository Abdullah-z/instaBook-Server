const { GoogleGenAI } = require("@google/genai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my API key is not configured. Please check the server settings.";
      }

      const ai = new GoogleGenAI({ apiKey });

      // Build context-aware prompt
      const prompt =
        history
          .map(
            (msg) =>
              `${msg.sender?.role === "ai_assistant" ? "AI" : "User"}: ${
                msg.text
              }`
          )
          .join("\n") + `\nUser: ${currentMessage}\nAI:`;

      console.log("🤖 Requesting Gemini response...");

      // Try 2.0 Flash first, fallback to 1.5 Flash
      const modelId = "gemini-2.0-flash-exp";

      try {
        const result = await ai.models.generateContent({
          model: modelId,
          contents: prompt,
        });

        // The @google/genai SDK usually returns text directly on the result object
        // but let's check for candidates/parts just in case
        const responseText =
          result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) return responseText;

        console.warn("⚠️ Empty response from AI:", JSON.stringify(result));
        return "I'm thinking, but I can't find the words right now.";
      } catch (apiErr) {
        console.warn(`⚠️ Model ${modelId} failed:`, apiErr.message);

        // Fallback to 1.5 Flash if 2.0 fails
        if (modelId !== "gemini-1.5-flash") {
          const fallbackResult = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: prompt,
          });
          return (
            fallbackResult.text ||
            fallbackResult.candidates?.[0]?.content?.parts?.[0]?.text ||
            "I'm a bit overwhelmed. Try again later!"
          );
        }
        throw apiErr;
      }
    } catch (err) {
      console.error("❌ Gemini AI Error:", err.message);
      if (err.message?.includes("429")) {
        return "I'm getting too many requests! Give me a minute to breathe.";
      }
      return "I'm having some trouble connecting to my brain. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
