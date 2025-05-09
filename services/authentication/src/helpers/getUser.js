const jwksClient = require('jwks-rsa');

const jwks = jwksClient({
    jwksUri: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}/.well-known/jwks.json`,
});

// Get public key for JWT verification
exports.getKey = (header, callback) => {
    jwks.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
};

// Extract idToken from Cookie header
exports.extractTokenFromCookies = (cookieHeader) => {
    const cookies = cookieHeader?.split(';').map((c) => c.trim()) || [];
    const tokenCookie = cookies.find((c) => c.startsWith('token='));
    return tokenCookie ? tokenCookie.split('=')[1] : null;
};
