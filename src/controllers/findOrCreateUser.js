import prisma from "./../../prisma/client.js";

/**
 * @param {object} userData - User data from payload Google
 * @returns {Promise<object>} - User objects (discovered or newly created), including local user_id.
 */
// for mentee
export async function findOrCreateUser(userData) {
  const { sub: googleSubId, email, name } = userData;

  // get sub_google_id.
  let user = await prisma.mentee.findUnique({
    where: {
      sub_google_id: googleSubId,
    },
  });

  // create user if the user does not exist
  if (!user) {
    user = await prisma.mentee.create({
      data: {
        sub_google_id: googleSubId,
        username: name,
        email: email,
        verify_status: false,
      },
    });

    // console.log(`Akun baru dibuat dengan ID lokal: ${user.id}`);
  } else {
    // console.log(`Pengguna ditemukan: ${user.email}. ID lokal: ${user.id}`);
  }

  return user;
}

// for campus
export async function findOrCreateCampus(userData) {
  const { sub: googleSubId, email, name } = userData;

  // get sub_google_id.
  let user = await prisma.campus.findUnique({
    where: {
      sub_google_id: googleSubId,
    },
  });

  // create user if the user does not exist
  if (!user) {
    user = await prisma.campus.create({
      data: {
        sub_google_id: googleSubId,
        // username: name,
        email: email,
        verification_status: "null",
        // verification_status: "accepted",
      },
    });

    const createBalance = await prisma.campus_wallet.create({
      data: {
        id_campus: user.id,
        current_balance: 0,
      },
    });

    // console.log(`Akun baru dibuat dengan ID lokal: ${user.id}`);
  } else {
    // console.log(`Pengguna ditemukan: ${user.email}. ID lokal: ${user.id}`);
  }

  return user;
}
