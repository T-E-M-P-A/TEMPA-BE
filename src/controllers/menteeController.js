import * as menteeService from "../services/menteeService.js";

// login oauth mentee
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

// get the program that the mentee has registered for
export const getProgramMentee = async (req, res, next) => {
  try {
    const menteeId = req.user.id;
    const result = await menteeService.getProgramMentee(menteeId);

    res.status(200).json({
      message: result.message,
      data: result.data,
      major_interest_status: result.major_interest_status,
    });
  } catch (error) {
    next(error);
  }
};

// get all program
export const getAllProgram = async (req, res, next) => {
  try {
    const result = await menteeService.getAllProgram();

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};
