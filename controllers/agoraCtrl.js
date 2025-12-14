const { RtcTokenBuilder, RtcRole } = require('agora-token');

// Get these from Agora Console
const APP_ID = process.env.AGORA_APP_ID || 'your_agora_app_id';
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || 'your_agora_app_certificate';

exports.generateToken = async (req, res) => {
  try {
    const { channelName, uid, role } = req.body;

    if (!channelName || uid === undefined) {
      return res.status(400).json({
        status: 0,
        msg: 'Channel name and UID are required',
      });
    }

    // Token expiration time (24 hours from now)
    const expirationTimeInSeconds = 86400;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Build token
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
      privilegeExpiredTs
    );

    res.status(200).json({
      status: 1,
      msg: 'Token generated successfully',
      token,
    });
  } catch (err) {
    console.error('Token generation error:', err);
    res.status(500).json({
      status: 0,
      msg: 'Failed to generate token',
      error: err.message,
    });
  }
};
