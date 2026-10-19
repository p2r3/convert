import { PopupData } from "src/ui";
import { popupOpen } from "src/ui/PopupStore";
import { HelpCircle } from "lucide-preact";
import tippy from "tippy.js";
import { useEffect, useRef } from "preact/hooks";
import StyledButton from "src/ui/components/StyledButton";

export default function HelpButton() {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!btnRef.current) return;
    const instance = tippy(btnRef.current, {
      content: "Help & Info",
      placement: "bottom",
      delay: [300, 0],
    });
    return () => instance.destroy();
  }, []);

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const onHelpClick = () => {
    PopupData.value = {
      dismissible: true,
      buttonText: "Got it",
    };
    PopupData.value.contents = (
      <div className="help-content">
        <h1>Convert to it!</h1>
        <p className="help-subtitle">Truly universal on-device file converter.</p>

        <div className="help-section">
          <h2>Why use this?</h2>
          <p>
            Most online converters require uploading your files to some server, which is terrible
            for privacy. This app runs entirely in your browser. Your files never leave your device.
          </p>
          <p>
            Other tools also force you to stay within one medium, which is super lame. What if you{" "}
            <i>really</i> need to convert an AVI video to a PDF document? Try to find an online tool
            for that, I dare you.
          </p>
          <p>
            <a href="https://youtu.be/btUbcsTbVA8" target="_blank" style="color: var(--primary)">
              Click here for a more in-depth video.
            </a>
          </p>
        </div>

        <div className="help-section">
          <h2>How to use</h2>
          <ol>
            <li>Select your file(s) by clicking, pasting, or dragging-and-dropping.</li>
            <li>Confirm the input format (usually auto-detected).</li>
            <li>Choose your desired output format.</li>
            <li>
              Click <strong>Convert</strong> and wait for the result.
            </li>
          </ol>
        </div>

        <div className="help-section">
          <h2>More than converting</h2>
          <p>
            After you pick a file, a row of <strong>Tools</strong> appears above the format list
            with what fits that file:
          </p>
          <ul>
            <li>
              <strong>Read text (OCR)</strong> gives the text of an image or a scanned PDF, in
              English and Dutch. Downloads about 10 MB the first time.
            </li>
            <li>
              <strong>Remove background</strong> cuts out the subject of a picture. Downloads about
              58 MB the first time.
            </li>
            <li>
              <strong>Upscale 2×</strong> doubles the size of a picture or a video. Needs a browser
              with WebGPU.
            </li>
            <li>
              <strong>Split into pages</strong> and <strong>Merge PDFs</strong>. To merge, select
              two or more PDFs.
            </li>
            <li>
              <strong>Combine into one PDF</strong> puts two or more pictures on pages of their own.
            </li>
            <li>
              <strong>Check audio</strong> tells whether a music file is what it claims to be: a
              lossy file sold as lossless, fake hi-res, clipping, damage, and how loud it is. It
              reads MP3, FLAC, WAV, Ogg, M4A, AAC and AIFF as they are; other formats are first
              converted, which hides their original encoding.
            </li>
            <li>
              <strong>Make a video</strong> turns a song into an MP4 that shows its cover art, or a
              waveform if it has none. <strong>Contact sheet</strong> lays 16 stills of a video out
              in one picture.
            </li>
          </ul>
          <p>In the bar at the bottom:</p>
          <ul>
            <li>
              <strong>Compress</strong> keeps the format and makes the file smaller.
            </li>
            <li>
              <strong>Settings</strong> sets quality, size, frame rate and bitrate, cuts a video or
              a sound to a start and an end, removes metadata such as the location of a photo, keeps
              or turns pages of a PDF, and puts a password on the zip. For sound it also evens out
              loudness, fades in and out, mixes to mono, plays backwards, cuts silence and changes
              speed. For a PDF it opens or sets a password and adds page numbers or a watermark. For
              a PNG it cuts the number of colours, which can make it much smaller.
            </li>
            <li>
              <strong>+</strong> adds more files. Each file can get its own output.
            </li>
          </ul>
        </div>

        <div className="help-section">
          <h2>Advanced mode</h2>
          <p>
            Advanced mode lets you select which handler to use for each format. Use it when you need
            fine-grained control over which tool handles the conversion.
          </p>
        </div>
      </div>
    );
    popupOpen.value = true;
  };

  return (
    <StyledButton buttonRef={btnRef} onClick={onHelpClick}>
      <HelpCircle size={16} />
      {" Help"}
    </StyledButton>
  );
}
