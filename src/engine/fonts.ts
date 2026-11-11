export const fontsReady = Promise.all(
  [
    ['Stillframe Sans', 'sans.woff2'],
    ['Stillframe Serif', 'serif.woff2'],
  ].map(async ([name, file]) => {
    const face = new FontFace(name, `url(${import.meta.env.BASE_URL}fonts/${file})`);
    await face.load();
    document.fonts.add(face);
  }),
);
