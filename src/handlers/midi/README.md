## MIDI handler

### Credit
- *TimGM6mb* soundfont is public domain, made by Timidity project, check them out they have awesome software for linux!!
- *midifilelib.js* is written by me (Minki) and given as a contribution to the convert projects, all rights transferred to p2r3/following licencing of the project unless declared otherwise.
- *js-synthesizer* node module is used for interfacing with *fluidsynth-emscripten*, both of which belonging to their respective owners.

### Word of warning
The midifilelib.js is a very crude implementation only covering the bare minimum as it only has to handle very simple routes, like writing midi events into a text file or converting note events into a midi file. It is by no means to be a feature-complete implementation of midi v0 or v1 and should not be used outside its designated purpose due to this reason. Please do not open bug reports on this repository about issues within this library if you are using it outside the scope of convert.to.it or any related projects it may be automatically included within.

- Minki
