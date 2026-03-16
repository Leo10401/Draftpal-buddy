import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import dbConnect from "@/lib/db";
import User from "@/models/User";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.send https://mail.google.com/",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        try {
          await dbConnect();

          console.log("signIn callback - profile:", {
            sub: profile.sub,
            email: profile.email,
            name: profile.name,
          });

          // Try finding by googleId first, then by email as fallback
          let existingUser = await User.findOne({ googleId: profile.sub });

          if (!existingUser) {
            existingUser = await User.findOne({ email: profile.email });
          }

          if (existingUser) {
            // Update existing user with new tokens and googleId
            existingUser.googleId = profile.sub;
            existingUser.googleTokens = {
              access_token: account.access_token,
              refresh_token:
                account.refresh_token ||
                existingUser.googleTokens?.refresh_token,
              expiry_date: account.expires_at
                ? account.expires_at * 1000
                : Date.now() + 3600 * 1000,
            };
            existingUser.photo = profile.picture || existingUser.photo;
            existingUser.displayName = profile.name || existingUser.displayName;
            await existingUser.save();
            console.log("signIn callback - Updated existing user:", existingUser.email);
          } else {
            // Create new user
            const newUser = await User.create({
              googleId: profile.sub,
              email: profile.email,
              displayName: profile.name || "",
              firstName: profile.given_name || "",
              lastName: profile.family_name || "",
              photo: profile.picture || "",
              googleTokens: {
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expiry_date: account.expires_at
                  ? account.expires_at * 1000
                  : Date.now() + 3600 * 1000,
              },
            });
            console.log("signIn callback - Created new user:", newUser.email);
          }

          return true;
        } catch (error) {
          console.error("Error in signIn callback:", error.message, error.stack);
          // Still allow sign in even if DB operation fails
          return true;
        }
      }
      return true;
    },

    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.googleId = profile?.sub;
      }

      // Look up MongoDB user ID
      if (token.googleId && !token.userId) {
        try {
          await dbConnect();
          const dbUser = await User.findOne({ googleId: token.googleId });
          if (dbUser) {
            token.userId = dbUser._id.toString();
          }
        } catch (error) {
          console.error("Error looking up user:", error);
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId;
        session.user.googleId = token.googleId;
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
