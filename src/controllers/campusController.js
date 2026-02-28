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
