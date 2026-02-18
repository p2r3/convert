## libOpenMPT handler

This handler adds support for various sample-based music formats.

I tried looking for a way to add this as a submodule but no official means for this exist and it appears as if the developers just want you to get the build from [their website](https://lib.openmpt.org/libopenmpt/download/).

I hope this is fine for now, otherwise we might have to add a script for cloning and building the source tree during build time.

Formats added by this library:
```
mptm, mod, s3m, xm, it, 667, 669, amf, ams, c67, cba, dbm, digi, dmf, dsm, dsym, dtm, etx, far, fc, fc13, fc14, fmt, fst, ftm, imf, ims, ice, j2b, m15, mdl, med, mms, mt2, mtm, mus, nst, okt, plm, psm, pt36, ptm, puma, rtm, sfx, sfx2, smod, st26, stk, stm, stx, stp, symmod, tcb, gmc, gtk, gt2, ult, unic, wow, xmf, gdm, mo3, oxm, umx, xpk, ppm, mmcmp
```
