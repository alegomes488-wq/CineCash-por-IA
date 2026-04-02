// Exemplo de como acessar a variável definida na imagem
exports.handler = async (event, context) => {
  const apiKey = process.env.EXAMPLE_KEY; // 'EXAMPLE_KEY' é a 'Key' que você definiu na Netlify

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Variável acessada com sucesso!" }),
  };
};
