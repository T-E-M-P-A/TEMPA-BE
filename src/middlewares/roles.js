/**
 * Middleware to restrict access based on user roles.
 * @param {string[]} allowedRoles - ['admin', 'mentee', 'mentor'].
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    // check req.user exist
    if (!req.user || !req.user.role) {
      return res
        .status(403)
        .json({ message: "Akses ditolak. Informasi peran tidak ditemukan." });
    }

    // get role from req.user
    const userRole = req.user.role.toLowerCase();

    // check if role allow
    if (allowedRoles.includes(userRole)) {
      next(); // Role is authorized. Proceed.
    } else {
      res
        .status(403)
        .json({ message: "Akses ditolak. Peran Anda tidak diizinkan." });
    }
  };
};

export default authorizeRoles;
