// netlify/functions/auth.js
exports.handler = async (event) => {
  // Só aceita requisições POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método não permitido" };
  }

  const { password } = JSON.parse(event.body);
  const correctPassword = process.env.ADMIN_PASSWORD; // Puxa da Netlify

  if (password === correctPassword) {
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, token: "session_active_123" })
    };
  } else {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: "Senha incorreta" })
    };
  }
};
