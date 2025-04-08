<div>
  &lt;input type="file" id="zipInput"&gt;
  
&lt;div id="error" style="color:red"&gt;&lt;/div&gt;

&lt;iframe id="preview" style="width:100%; height:300px"&gt;&lt;/iframe&gt;

&lt;script src="https://cdn-zemuframeweb.netlify.app/zemuframeweb.js"&gt;&lt;/script&gt;
&lt;script&gt;
  async function renderZip() {
    const input = document.getElementById('zipInput');
    const iframe = document.getElementById('preview');
    const errorDiv = document.getElementById('error');

    errorDiv.style.display = 'none';
    errorDiv.textContent = '';

    const file = input.files[0];
    if (!file) {
      errorDiv.textContent = 'Por favor, selecione um arquivo ZIP.';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      await Zemuframeweb(file, iframe);
    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.style.display = 'block';
      console.error(error);
    }
  }

  document.getElementById('zipInput').addEventListener('change', renderZip);
&lt;/script&gt;</div>
