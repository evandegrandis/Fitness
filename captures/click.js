// Utilitaire injecté : cliquer un bouton du simulateur par son texte.
window.__click = (text, times = 1) => {
  const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.trim().toLowerCase() === text.toLowerCase());
  for (let index = 0; index < times; index += 1) button?.click();
  return Boolean(button);
};
