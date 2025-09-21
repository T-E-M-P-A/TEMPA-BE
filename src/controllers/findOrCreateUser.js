import prisma from "./../../prisma/client";

/**
 * @param {object} userData - User data from payload Google
 * @returns {Promise<object>} - User objects (discovered or newly created), including local user_id.
 */
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
        status: "Active",
      },
    });

    console.log(`Akun baru dibuat dengan ID lokal: ${user.id}`);
  } else {
    console.log(`Pengguna ditemukan: ${user.email}. ID lokal: ${user.id}`);
  }

  return user;
}
