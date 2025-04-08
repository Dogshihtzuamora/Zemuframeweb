Zemuframeweb

Emulador web para projetos ZIP com sites HTML.
Renderiza tudo dentro de um <iframe> como se fosse um servidor real.

-------------------------------------
Como usar:

1. Importe o Zemuframeweb

2. Use a função principal:

Zemuframeweb(arquivoZip, idDoIframe);

- arquivoZip: o arquivo .zip vindo de um <input type="file">
- idDoIframe: o ID do <iframe> onde o site será carregado

Exemplo completo:

<input type="file" id="zipInput">
<iframe id="visor" style="width: 100%; height: 500px;"></iframe>

<script>
    zipInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) Zemuframeweb(file, 'visor');
    });
</script>

-------------------------------------
O que ele faz:

- Procura automaticamente o arquivo index.html no ZIP
- Emula fetch, XHR e navegação interna (<a href="...">)
- Converte todos os arquivos do ZIP em blob URLs
- Funciona 100% offline direto no navegador

-------------------------------------
Requisitos:

- ZIP deve conter um index.html
- Deve estar tudo com caminhos relativos corretos (como num site real)

-------------------------------------
Licença:

MIT License
