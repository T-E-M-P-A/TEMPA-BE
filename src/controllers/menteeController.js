import * as menteeService from "../services/menteeService.js";

export const loginMentee = async (req, res, next) => {
  try {
    const token = req.body.credential;

    if (!token) {
      return res.status(400).json({ error: "No credential token provided." });
    }

    const user = await menteeService.authenticateGoogleUser(token);

    res.status(200).json({
      message: "Login successful!",
      data: {
        token: user.signedJwtToken,
        fullName: user.name,
        uniqueId: user.localUserId,
        email: user.email,
        verify_status: user.userRecord.verify_status,
      },
    });
  } catch (error) {
    next(error);
  }
};
