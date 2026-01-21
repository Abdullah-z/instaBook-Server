const cron = require("node-cron");
const Reminders = require("../models/reminderModel");
const { sendPushNotification } = require("../socketServer");

const startReminderScheduler = () => {
  // Run every minute
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      // Find pending reminders that should have been sent by now
      const pendingReminders = await Reminders.find({
        status: "pending",
        remindAt: { $lte: now },
      }).populate("user", "username pushToken");

      if (pendingReminders.length > 0) {
        console.log(
          `⏰ [Scheduler] Processing ${pendingReminders.length} reminders...`,
        );

        for (const reminder of pendingReminders) {
          try {
            if (reminder.user && reminder.user.pushToken) {
              await sendPushNotification(
                reminder.user._id,
                "📌 Reminder",
                reminder.text,
                {
                  type: "REMINDER",
                  reminderId: reminder._id,
                },
              );
              console.log(
                `✅ [Scheduler] Sent push for reminder: ${reminder._id}`,
              );
            } else {
              console.warn(
                `⚠️ [Scheduler] Skip push: No token for user ${reminder.user?._id}`,
              );
            }

            // Mark as completed regardless of push success (to avoid re-sending)
            reminder.status = "completed";
            await reminder.save();
          } catch (err) {
            console.error(
              `❌ [Scheduler] Error processing reminder ${reminder._id}:`,
              err.message,
            );
          }
        }
      }
    } catch (err) {
      console.error("❌ [Scheduler] Global Error:", err.message);
    }
  });

  console.log("🚀 Reminder Scheduler started (every minute).");
};

module.exports = startReminderScheduler;
