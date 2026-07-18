# Demo Video Production

The repository includes a reproducible zero-cost demo-video pipeline:

- `VIDEO_NARRATION.txt`: the final narration text.
- `DEMO_SEQUENCE.ffconcat`: timing for the four verified browser states.
- `assets/demo-01-failure.png`: initial silent divergence.
- `assets/demo-02-contract.png`: canonical contract view.
- `assets/demo-03-minimized.png`: three-operation witness.
- `assets/demo-04-passed.png`: corrected adapter verification.
- `scripts/render_demo.sh`: local macOS speech synthesis plus FFmpeg render.

Render locally with:

```bash
scripts/render_demo.sh ./counterexample-studio-demo.mp4
```

The validated output is 169 seconds, 1600x900 H.264 video with an AAC mono narration track. The audio measures approximately -16 dB mean and -1.2 dB peak. The output remains outside source control until it is uploaded to the public video host required by the submission.
