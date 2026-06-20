declare global {
    namespace Express {
        interface Request {
            userId?: string,
            adminId?: string
        }
    }
}

export {}