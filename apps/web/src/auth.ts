import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
} from "amazon-cognito-identity-js";
import type { Role } from "./types";

const pool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "us-east-1_demo",
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "demo",
});

export function currentToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = pool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((error: Error | null, session: { isValid(): boolean; getIdToken(): { getJwtToken(): string } }) => {
      if (error || !session.isValid()) return resolve(null);
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

export function signIn(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: (session) => resolve(session.getIdToken().getJwtToken()),
      onFailure: reject,
    });
  });
}

export function signUp(name: string, email: string, password: string, role: Role): Promise<void> {
  return new Promise((resolve, reject) => {
    pool.signUp(
      email,
      password,
      [
        new CognitoUserAttribute({ Name: "name", Value: name }),
        new CognitoUserAttribute({ Name: "custom:role", Value: role }),
      ],
      [],
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

export function confirm(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    new CognitoUser({ Username: email, Pool: pool }).confirmRegistration(code, true, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}

export function signOut() {
  pool.getCurrentUser()?.signOut();
}

