import 'express-session';

declare module 'express-session' {
  interface Session {
    // You can add any custom session data properties here if needed
  }
}

declare module 'express' {
  interface Request {
    session: session.Session & {
      id: string;
    };
    sessionID: string;
  }
}
