# Aurora

Uma página que é só um fundo animado: campos de cor translúcidos, sorteados ao acaso, que se transformam devagar e sem parar, em modo claro e escuro. Não tem texto, botão nem conteúdo. É um único arquivo, `index.html`.

## Resultado

Medido num iPhone com Safari 27, em retrato:

| Como abre | O que aparece |
|---|---|
| Aba do Safari, sem tocar | A animação vai até as bordas e se funde com a barra de status e a barra de baixo, sem emenda |
| Aba do Safari, depois de um toque | Tela cheia de ponta a ponta (912 de altura), sem barras do Safari |
| Pelo ícone na tela de início (app web) | Tela cheia ao abrir, sem toque |
| Aba do Safari, em paisagem | A animação vai até as bordas laterais e de baixo |

## Como chegamos aqui

A Aurora começou do zero, num repositório com o histórico apagado, depois de várias versões que ficavam presas num retângulo. O caminho até a solução foi este.

### 1. O retângulo

As primeiras versões desenhavam a animação num elemento `position: fixed`. Pela W3C ([CSS Positioned Layout Level 3](https://www.w3.org/TR/css-position-3/)), um elemento fixo é "positioned and sized relative to a fixed positioning containing block (usually the viewport […]). The box's position is fixed with respect to this reference rectangle". Por definição, ele fica preso ao retângulo do viewport, e nenhuma unidade de altura (`dvh`, `svh`, `lvh`) muda isso. A animação passou para o fluxo do documento, medindo `100lvh`.

### 2. Medir no aparelho em vez de supor

Cada mudança feita sem ver a tela gerava uma explicação de por que deveria funcionar, e não funcionava. A virada foi uma página de medição aberta no iPhone: ela pintava de vermelho tudo o que ficava fora da animação e mostrava os números reais do aparelho. Os números mostraram:

- `100lvh` = 786 e `100svh` = 746: o viewport grande existe, mas o Safari nunca entrou nele, nem com 1.700px de rolagem;
- `env(safe-area-inset-*)` = 0 nos quatro lados em retrato, e 68/68/20 em paisagem: em retrato, o Safari não aplica o `viewport-fit=cover`;
- a barra de status e a faixa de baixo ficavam vermelhas, a cor de fundo do `html`. Nessas áreas, o Safari pinta só uma cor, nunca o conteúdo da página.

### 3. A confirmação da Apple

O [bug 306465 do WebKit](https://bugs.webkit.org/show_bug.cgi?id=306465), "viewport-fit=cover is not respected on iOS in portrait mode", descreve exatamente esse comportamento. Tim Horton, engenheiro do WebKit, explicou no comentário de 19/08/2026: "Unfortunately, this is currently necessary for web compatibility. […] for web compatibility's sake, we can't provide top and bottom insets like you're hoping for here." Não é um defeito da página: em retrato, numa aba, o Safari não libera essas áreas.

Também foi testado `height=device-height` no meta viewport, que a [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport) documenta e que outro desenvolvedor usou para o mesmo problema. Não teve efeito: `100vh` continuou em 786.

### 4. A tela cheia com um toque

A demonstração anexada ao bug tem uma opção "Fullscreen". No iPhone, ela levou a página a 912 de altura, de ponta a ponta. É a Fullscreen API, que o WebKit só libera no iOS para páginas com `viewport-fit:cover` ([commit 0e684f1d](https://github.com/WebKit/WebKit/commit/0e684f1df)). A Aurora passou a pedir tela cheia no toque. Ajustes que vieram das medidas:

- o toque precisa ser escutado no próprio canvas, como na [demonstração](https://github.com/web-platform-tests/interop-2022-viewport/blob/main/demos/src/core.js); escutado na janela, o Safari do iPhone não o entregava;
- com `click`, foram precisos dois toques; com `pointerup`, que pela [especificação do HTML](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event) já é um gesto válido, basta um;
- em tela cheia, `100lvh` = 912 já inclui as áreas seguras (68 em cima, 42 embaixo). Um `padding-bottom: env(safe-area-inset-bottom)` que somava a área de baixo deixava o documento 42px maior que a tela e saiu.

### 5. As faixas viram parte da animação

Restavam as faixas de cima e de baixo ao abrir numa aba, sem toque. A página não consegue desenhar nelas, mas consegue escolher a cor delas: é a cor de fundo do `html`. A primeira versão copiava para o `html` a cor lida nas bordas da animação, mas as faixas continuavam sólidas ao lado de uma animação variada, e a emenda aparecia.

A solução que resolveu foi inverter a ideia: em vez de a faixa imitar a animação, a animação vai ao encontro da faixa. Perto do topo e da base, a animação se transforma aos poucos numa única cor de borda, e o fundo do `html` recebe exatamente essa cor, do mesmo cálculo. Na tela, animação e faixas viram uma superfície só.

## Como a tela cheia é feita

### `viewport-fit=cover`

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

- **W3C, [CSS Round Display Level 1](https://www.w3.org/TR/css-round-display-1/), valor `cover`:** "The initial layout viewport and the visual viewport are set to the circumscribed rectangle of the physical screen of the device."
- **MDN, [`<meta name="viewport">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport):** "`cover`: The viewport is scaled to fill the device display."
- **Chrome, [edge-to-edge migration guide](https://developer.chrome.com/docs/css-ui/edge-to-edge):** "To opt-in to edge-to-edge, set viewport-fit to the value of cover."

No iPhone em retrato, numa aba, o Safari não o aplica em cima e embaixo (bug 306465). Em paisagem, em tela cheia e como app web, aplica.

### `100lvh` no fluxo do documento

```css
body {
  margin: 0;
}
canvas {
  display: block;
  width: 100%;
  height: 100lvh;
}
```

- **W3C, [CSS Values and Units Level 4](https://www.w3.org/TR/css-values-4/):** o "large viewport size" é "the viewport sized assuming any UA interfaces that are dynamically expanded and retracted to be retracted. This allows authors to size content such that it is guaranteed to fill the viewport".
- **MDN, [`<length>`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length):** "The large viewport size allows the content you design to fill the entire viewport when browser interfaces are retracting."

O canvas é o único conteúdo do documento. `margin: 0` evita que a margem padrão do `body` some 16px à altura; `display: block` evita o espaço abaixo da linha de texto; `width: 100%` evita a largura padrão de 300px.

### Um toque pede tela cheia

```js
canvas.addEventListener('pointerup', () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (request) Promise.resolve(request.call(root)).catch(() => {});
});
```

- **MDN, [`Element.requestFullscreen()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen):** "Transient user activation is required. The user has to interact with the page or a UI element in order for this feature to work." Por isso a tela cheia vem com o primeiro toque, e não ao abrir.
- Se o pedido for recusado, nada acontece, e o próximo toque pede de novo.

### Aberta pela tela de início

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

- **Apple, [Safari HTML Reference: Supported Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html):** `apple-mobile-web-app-capable` faz a aplicação web rodar em tela cheia; com `black-translucent`, o conteúdo ocupa a tela inteira, por baixo da barra de status.

Adicionada à tela de início e aberta pelo ícone, a Aurora abre em tela cheia, sem toque.

## Sem zoom

A Aurora é só uma animação, então a página não oferece zoom.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
```

```css
html {
  touch-action: none;
}
```

- **MDN, [`<meta name="viewport">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport):** `maximum-scale` define o zoom máximo, e `user-scalable` indica "if the user can zoom the web page". A própria MDN registra que o iOS 10 em diante ignora essas duas chaves por padrão.
- **MDN, [`touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action):** `none` "Disable browser handling of all panning and zooming gestures." É isso que impede o zoom com dois dedos e com toque duplo no Safari do iPhone. Os toques continuam chegando à página, então o toque que pede tela cheia segue funcionando.

## Como a animação é feita

- **WebGL:** um shader calcula a cor de cada pixel na placa de vídeo.
- **Formas:** vêm de ruído procedural (fractal Brownian motion sobre value noise, com distorção de domínio). É um campo contínuo e orgânico, que se deforma devagar com o tempo.
- **Camadas:** quatro camadas translúcidas desse campo se sobrepõem à cor de base, cada uma com sua cor. O resultado é opaco.
- **Cores:** a cada 16 segundos, uma nova combinação de quatro cores é sorteada, e as atuais migram suavemente para ela.
- **Claro e escuro:** a cor de base é `#f4f2f7` no claro e `#07070b` no escuro, e no escuro as cores sorteadas são mais fundas. Se o sistema trocar de tema, as cores são sorteadas de novo.
- **Bordas:** a cada quadro, uma cor de borda é calculada a partir das cores atuais (média das quatro cores, 60%, com a cor de base, 40%). Nos últimos 14% da altura, em cima e embaixo, a animação se transforma aos poucos nessa cor; na primeira e na última linha, ela é exatamente essa cor. O fundo do `html`, que o Safari usa para pintar as áreas fora do documento, recebe o mesmo valor.
- **Tamanho:** o canvas é medido pelo próprio tamanho na página (`ResizeObserver`), nunca pela janela.
- **Perda do contexto WebGL:** se o navegador descartar o contexto (quando o Safari fica em segundo plano ou falta memória), a Aurora o recupera e volta a desenhar, sem recarregar a página, como indica a MDN: [`webglcontextlost`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event) com `preventDefault()` e [`webglcontextrestored`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event) recriando o programa.

## Medição

O arquivo `medir.html` é a página de medição usada para chegar a esta solução. Ela tem as mesmas regras de tamanho da Aurora, pinta de vermelho o que fica fora da área da animação e mostra na tela as alturas `lvh`, `svh`, `dvh` e `vh`, as áreas seguras, o estado da Fullscreen API e um botão de tela cheia.
