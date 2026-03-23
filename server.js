const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDeIt5-JcazAHv-9evAbRUCnO7_u2eV_GQ';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Provador Virtual NALUME' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Virtual Try-On endpoint
app.post('/api/virtual-tryon', async (req, res) => {
  try {
    const { userImage, productImage, productName } = req.body;

    if (!userImage || !productImage) {
      return res.status(400).json({ error: 'Imagens são obrigatórias' });
    }

    console.log('[Try-On] Processando...');

    // Preparar imagens
    const userBase64 = userImage.replace(/^data:image\/\w+;base64,/, '');
    
    let productBase64;
    if (productImage.startsWith('data:')) {
      productBase64 = productImage.replace(/^data:image\/\w+;base64,/, '');
    } else {
      const imgResponse = await axios.get(productImage, { responseType: 'arraybuffer', timeout: 30000 });
      productBase64 = Buffer.from(imgResponse.data).toString('base64');
    }

    // Prompt para o Gemini
    const prompt = `You are a fashion virtual try-on system. Create a photorealistic image showing the person from the FIRST image wearing the clothing from the SECOND image.

CRITICAL RULES:
- Keep the person's face, body, pose, and background EXACTLY the same
- Only replace their clothing with the garment from the second image
- Make it look natural with proper lighting and fabric draping
- The clothing item is: ${productName || 'fitness wear'}

Generate ONE high-quality photorealistic result.`;

    // Chamar Gemini API
    const response = await axios.post(
      `${GEMINI_URL}/${GEMINI_MODEL}:generateContent`,
      {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: userBase64 } },
            { inline_data: { mime_type: 'image/jpeg', data: productBase64 } }
          ]
        }],
        generationConfig: { responseModalities: ['IMAGE'] }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        timeout: 180000
      }
    );

    // Extrair imagem da resposta
    const parts = response.data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inline_data?.data) {
        const mime = part.inline_data.mime_type || 'image/png';
        console.log('[Try-On] Sucesso!');
        return res.json({
          success: true,
          resultImage: `data:${mime};base64,${part.inline_data.data}`
        });
      }
    }

    throw new Error('Nenhuma imagem gerada');

  } catch (error) {
    console.error('[Try-On] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro ao processar imagem',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
