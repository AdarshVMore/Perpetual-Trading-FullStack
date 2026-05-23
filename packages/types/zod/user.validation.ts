import z from "zod";

export const userSchemaValidation = z.object({
    email: z.email(),
    password: z.string()
})

export const orderSchemaValidation = z.object({
    
})