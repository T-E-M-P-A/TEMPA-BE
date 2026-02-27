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

// get detail program
export const detailProgram = async (req, res, next) => {
  try {
    const idProgram = req.params.id;
    const result = await menteeService.detailProgram(idProgram);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get all campus
export const getAllCampus = async (req, res, next) => {
  try {
    const result = await menteeService.getCampus();

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get detail campus
export const detailCampus = async (req, res, next) => {
  try {
    const idCampus = req.params.id;
    const result = await menteeService.detailCampus(idCampus);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// register program
export const registerProgram = async (req, res, next) => {
  try {
    const idMentee = req.user.id;
    const { idProgram } = req.params;
    const idProgramInt = parseInt(idProgram);

    const result = await menteeService.registerProgram(idMentee, idProgramInt);

    res.status(201).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get majors
export const getMajors = async (req, res, next) => {
  try {
    const result = await menteeService.getMajors();

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get detail major
export const detailMajor = async (req, res, next) => {
  try {
    const { majorName } = req.params;
    const result = await menteeService.detailMajor(majorName);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// recomendation majors
export const recomendationMajors = async (req, res, next) => {
  try {
    const menteeId = req.user.id;

    const result = await menteeService.recomendationMajors(menteeId, req.body);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get response ai from databse if mentee already assign form
export const getResponseAi = async (req, res, next) => {
  try {
    const menteeId = req.user.id;

    const result = await menteeService.getResponseAi(menteeId);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get materi
export const getMateri = async (req, res, next) => {
  try {
    const idProgram = parseInt(req.params.id_program);
    const idMentee = parseInt(req.user.id);

    const result = await menteeService.getMateri(idProgram, idMentee);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// give feedback
export const giveFeedbackProgram = async (req, res, next) => {
  try {
    const idMentee = req.user.id;
    const { idProgram } = req.params;

    const result = await menteeService.giveFeedbackProgram(
      idMentee,
      idProgram,
      req.body,
    );

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// verify mentee
export const verifyMentee = async (req, res, next) => {
  try {
    const menteeId = req.user.id;
    const result = await menteeService.verifyMentee(menteeId, req.body);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// check verify account
export const checkVerifyStatus = async (req, res, next) => {
  try {
    const menteeId = req.user.id;

    const result = await menteeService.checkVerifyAccount(menteeId);
    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get profile mentee
export const getProfileMentee = async (req, res, next) => {
  try {
    const menteeId = req.user.id;

    const result = await menteeService.getProfileMentee(menteeId);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// edit profile mentee
export const majorInterest = async (req, res, next) => {
  try {
    const menteeId = req.user.id;

    const result = await menteeService.majorInterest(menteeId, req.body);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};
