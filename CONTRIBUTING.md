# Contributing

Thanks for helping with this fork of Convert.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug or asking for a feature

Open an [issue](https://github.com/Gitguy268/convert/issues/new/choose) and use the template. For a bug, say which browser and version, what you did, what you expected and what happened.

Report security problems privately: see [SECURITY.md](SECURITY.md).

## Making a change

1. Fork the repository and create a branch from `master`.
2. Set it up and run it:

   ```sh
   bun install
   bun run dev
   ```

3. Make your change. Keep commits small, each with a clear message.
4. Run the checks below and update the README if behaviour changed.
5. Open a pull request and fill in the template.

## Checks

```sh
bun run lint
bun run fmt:check
bun test
bun run build
```

Adding a file format? The README's [Contributing](README.md#contributing) section explains how a handler is written and what a format request needs.

## Licences

This project is licensed under the GNU General Public License, version 2 (see [LICENSE](LICENSE)), and your contribution is accepted under the same licence. Any library or code you bring in must have a licence that can be combined with it; say which licence it has in the pull request. [NOTICE](NOTICE) explains where this fork comes from and what is known about the licences of its dependencies.
