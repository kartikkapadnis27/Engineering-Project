declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: 'BUYER' | 'SELLER' | 'ADMIN';
      };
    }
  }
}

export {};
