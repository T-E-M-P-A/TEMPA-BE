import * as campusService from "../services/campusService.js";

// login campus
export const loginCampus = async (req, res, next) => {
  try {
    const token = req.body.credential;

    const result = await campusService.loginCampus(token);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// register campus
export const registerCampus = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const result = await campusService.registerCampus(req.body, idCampus);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// edit data campus
export const editDataCampus = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const result = await campusService.editDataCampus(req.body, idCampus);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// check verification campus
export const checkVerificationCampus = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const result = await campusService.checkVerificationCampus(idCampus);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get detail verification campus (For Edit Form)
export const getDetailVerificationCampus = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const result = await campusService.getDetailVerificationCampus(idCampus);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get all program by campus id
export const getAllProgramByCampusId = async (req, res, next) => {
  try {
    const idCampus = req.user.id;

    const result = await campusService.getAllProgramByCampusId(idCampus);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get detail program
export const getDetailProgram = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const idProgram = req.params.id;

    const result = await campusService.getDetailProgram(idCampus, idProgram);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get all mentee where registered program
export const getAllMenteeWhereRegisteredProgram = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const idProgram = req.params.id;

    const result = await campusService.getAllMenteeWhereRegisteredProgram(
      idCampus,
      idProgram,
    );
    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get program feedback
export const getProgramFeedback = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const idProgram = parseInt(req.params.id);

    const result = await campusService.getProgramFeedback(idCampus, idProgram);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// get campus name from api
export const getNameCampus = async (req, res, next) => {
  try {
    const { campusName } = req.params;

    const result = await campusService.getNameCampus(campusName);
    // console.log(result);

    return res.json(result);
  } catch (error) {
    next(error);
  }
};

// get data program campus for chart
export const getProgramCampusDataChart = async (req, res, next) => {
  try {
    const idCampus = req.user.id;

    const result = await campusService.getProgramCampusDataChart(idCampus);

    res.status(200).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// create program campus
export const createProgram = async (req, res, next) => {
  try {
    const idCampus = req.user.id;

    const result = await campusService.createProgram(
      req.body,
      idCampus,
      req.file,
    );

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// update program
export const updateProgram = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const { id } = req.params;

    const result = await campusService.updateProgram(
      idCampus,
      id,
      req.body,
      req.file,
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// delete program
export const deleteProgram = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const { id } = req.params;

    const result = await campusService.deleteProgram(idCampus, id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// get presensi mentee
export const getPresensiMentee = async (req, res, next) => {
  try {
    const idCampus = req.user.id;
    const idProgram = req.params.id;

    const result = await campusService.getPresensiMentee(idCampus, idProgram);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
