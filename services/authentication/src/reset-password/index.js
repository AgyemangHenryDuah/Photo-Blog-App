import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient();

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const handler = async (event) => {
  try {
    const { email, confirmationCode, newPassword } = JSON.parse(event.body);

    if (!email || !confirmationCode || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Email, confirmation code, and new password are required',
        }),
      };
    }

    if (!isPasswordValid(newPassword)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Password does not meet complexity requirements',
        }),
      };
    }

    const confirmForgotPasswordParams = {
      ClientId: process.env.CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword,
    };

    const command = new ConfirmForgotPasswordCommand(
      confirmForgotPasswordParams,
    );
    await cognitoClient.send(command);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Password has been reset successfully' }),
    };
  } catch (error) {
    console.error('Error confirming password reset:', error);

    if (error.name === 'CodeMismatchException') codeMismatchRes();
    if (error.name === 'ExpiredCodeException') expiredCodeRes();
    if (error.name === 'InvalidPasswordException') invalidPasswordRes(error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Error resetting password',
        error: error.message,
      }),
    };
  }
};

// Helper function to validate password complexity
const isPasswordValid = (password) => {
  // Password must be at least 8 characters long and include:
  // - At least one uppercase letter
  // - At least one lowercase letter
  // - At least one number
  // - At least one special character
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  return (
    password.length >= minLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    hasSpecialChar
  );
};

const codeMismatchRes = () => ({
  statusCode: 400,
  headers,
  body: JSON.stringify({ message: 'Invalid verification code' }),
});

const expiredCodeRes = () => ({
  statusCode: 400,
  headers,
  body: JSON.stringify({ message: 'Verification code has expired' }),
});

const invalidPasswordRes = (error) => ({
  statusCode: 400,
  headers,
  body: JSON.stringify({ message: error.message }),
});
