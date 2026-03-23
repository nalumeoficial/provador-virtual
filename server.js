const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyB21kuXQqt0bZHP5iwePqriDj-TxLQMX-w';
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
    const { userImage, productImages, productImage, productName } = req.body;

    // Aceitar array de imagens ou imagem única (compatibilidade)
    const allProductImages = productImages && productImages.length > 0 ? productImages : (productImage ? [productImage] : []);

    if (!userImage || allProductImages.length === 0) {
      return res.status(400).json({ error: 'Imagens são obrigatórias' });
    }

    console.log(`[Try-On] Processando com ${allProductImages.length} foto(s) do produto...`);

    // Preparar imagem da cliente
    const userBase64 = userImage.replace(/^data:image\/\w+;base64,/, '');

    // Preparar todas as imagens do produto
    const productBase64List = [];
    for (const img of allProductImages) {
      let base64;
      if (img.startsWith('data:')) {
        base64 = img.replace(/^data:image\/\w+;base64,/, '');
      } else {
        const imgResponse = await axios.get(img, { responseType: 'arraybuffer', timeout: 30000 });
        base64 = Buffer.from(imgResponse.data).toString('base64');
      }
      productBase64List.push(base64);
    }

    // Prompt para o Gemini
    const imageCount = productBase64List.length;
    const prompt = `You are a fashion virtual try-on system. Create a photorealistic image showing the person from the FIRST image wearing the clothing shown in the NEXT ${imageCount} image(s).

CRITICAL RULES:
- The FIRST image is the customer's photo — keep their face, body, pose, and background EXACTLY the same
- The NEXT ${imageCount} image(s) show the SAME clothing item "${productName || 'fitness wear'}" from different angles and details
- Analyze ALL product images to understand the garment's complete design: front, back, details, texture, color, and pattern
- Replace the customer's clothing with this garment, making sure the result reflects all details visible across the product photos
- Make it look natural with proper lighting and fabric draping

Generate ONE high-quality photorealistic result.`;

    // Montar parts: prompt + foto da cliente + todas as fotos do produto
    const parts = [
      { text: prompt },
      { inline_data: { mime_type: 'image/jpeg', data: userBase64 } }
    ];
    for (const pBase64 of productBase64List) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: pBase64 } });
    }

    // Chamar Gemini API
    const response = await axios.post(
      `${GEMINI_URL}/${GEMINI_MODEL}:generateContent`,
      {
        contents: [{ parts }],
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
