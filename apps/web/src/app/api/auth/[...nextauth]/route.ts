import NextAuth from 'next-auth';

import { authOptions } from '@/lib/auth';

/**
 * The Auth.js endpoints. The only route in this app that is deliberately
 * reachable without a session — signing in is how you get one.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
