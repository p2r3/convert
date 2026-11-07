# Waterfalls

A lot of times when creating handlers, there is an urge to avoid actually doing the hard work of converting between formats and instead create a handler that is not meaningful and does not actually convert the data, instead opting to go for its internal representation. I call these **waterfalls**: conversions that do not end up actually producing anything meaningful, being just a repackaging of the internal representation.

The general question to ask yourself is: "Does this conversion keep the overall meaning of the file, even if we only interpret it as the output format?". Importantly, we need to consider the output in isolation from the input.

## Catching them

The simplest way a waterfall is created is by making a binary waterfall, or a waterfall by binary reinterpretation. To make one, just reinterpret the bytes of the file as something else, without regard for the meaning.

- ANY -> png by taking bytes and putting them down row by row does not keep the meaning of the file, therefore it is a waterfall by binary reinterpretation. Same for ANY -> wav, ANY -> txt.
- wav -> f32 by extracting the samples does keep the meaning of the file, therefore it is not a waterfall.
- wav -> png by taking a spectrogram and putting it into an image does keep the meaning (spectrograms are a common way to display audio), therefore it is not a waterfall.

A diffrent common waterfall is made by reinterpreting the inner layer of the file as something else, losing the meaning of the overall file. This is a waterfall by inner reinterpretation.

- svg -> xml by not doing anything loses the meaning that is "an image" and turns it into meaningless structured data, therefore it is a waterfall by inner reinterpretation.
- json -> txt by not doing anything loses the meaning that is "structured data" by reducing it to text, therefore it is a waterfall by inner reinterpretation. This also applies to svg -> txt and html -> txt.
- apk -> zip by not doing anything loses the meaning that is "an application" by turning it into an archive of binary internal files specific to apk, therefore it is a waterfall by inner reinterpretation.
- cbz -> zip by not doing anything does not lose the meaning that is "a comic book" by being turned into an archive of numbered images, therefore it is not a waterfall.

The most hidden kind of a waterfall is made by creating an ad-hoc format specific to your handler. This is a waterfall by custom format.

- flp -> json by parsing and turning into a custom-made format does not encode the meaning that is "a song" as a JSON file, therefore it is a waterfall by custom format. Also applies to fen -> json, bsor -> json, etc.
- exe -> zip by putting sections into an archive does not encode the meaning that is "an application" as an archive, therefore it is a waterfall by custom format. Note that this would not apply if we were extracting a self extracting exe file.
- yaml -> json by converting keeps the meaning that is "structured data", therefore it is not a waterfall.
