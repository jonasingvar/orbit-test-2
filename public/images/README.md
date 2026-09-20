# Hero photography

Drop conference photos here as `hero-1.jpg` … `hero-6.jpg` and the home page
picks them up automatically — `src/components/HeroMedia.jsx` probes each name,
ignores any that are missing, and cross-fades between whichever exist.

- **Aspect:** landscape, roughly 2:1. The hero crops to fill, and the left
  ~55% sits under the headline, so keep the subject right of centre.
- **Size:** 2400×1200 or larger, saved as JPG at ~75% quality. Aim for under
  400KB each — they load before anything else on the page.
- **Content:** no readable text, logos or recognisable faces. Backs of heads,
  silhouettes and crowds from behind work best, and avoid anything that looks
  like a real company's event.

These are generated images, like everything else visual in this repo. Nothing
here should be a photograph of real people.
