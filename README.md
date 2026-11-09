# Liar's Dice

A browser Liar's Dice game. It has private multiplayer rooms and a single-player mode against 3 computer players.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000.

- **Single player:** enter a name and click **Play vs Computer**. This mode runs entirely in the browser.
- **Multiplayer:** click **Create Room** to get a 5-letter code. Friends enter it under **Join Room**, or use the **Copy invite link** button. The host can add computer players, set the rules, and start the game (2–8 players).

## Put it online (permanent link)

The game is one small Node server, so any Node host works. The easiest free option is **Render**:

1. Put this folder in a GitHub repository.
2. On [render.com](https://render.com), sign in with GitHub, then **New + → Blueprint** and pick the repo. `render.yaml` sets everything up (`npm install`, `npm start`, health check at `/healthz`).
3. Render gives you a link like `https://liars-dice-xxxx.onrender.com`. Send it to your friends.

On the free plan the server sleeps after about 15 minutes with no visitors. The first visit after that takes about a minute to wake it up. Rooms live in memory, so a restart or redeploy ends any games in progress.

**Temporary link from your own computer** (only works while your computer is on and running the game):

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

## iPhone and iPad

Open the link in Safari, tap **Share → Add to Home Screen**. It installs with its own icon and runs full screen like an app. Single player also works offline once it's been opened.

## Rules
- Five dice each. Everyone rolls one die, and the highest roll opens. Play goes to the left.
- Raise the bid or call "Liar!". There is no passing. To raise the number, bid the same or a greater quantity.
- **Standard mode:** when you raise the quantity you may bid a lower number (3 × 3s → 4 × 2s).
- **Hard mode:** the number can never go down. Once someone bids 6s, only the quantity can rise.
- Ones are wild. Nobody may open a round on ones.
- On "Liar!", count the bid number plus all ones. If the total is equal to or greater than the bid, the challenger loses a die. Otherwise the bidder loses one. The loser opens the next round.
- **Palafico:** while anyone is down to one die (and more than two players remain), every round is palafico. A one-die player opens it, rotating clockwise among one-die players. Ones may be bid to open and aren't wild, and the number can't change.
- In single player, once you're out the rest of the game is resolved instantly and you get the final results.

## Files
- `public/engine.js`: game rules (shared by the browser and the server)
- `public/bots.js`: computer player AI (probability-based, with cautious / balanced / bold personalities)
- `public/characters.js`: the pirate crew (SVG avatars, personalities, quips)
- `public/sound.js`: synthesized sound effects (Web Audio, no audio files)
- `public/app.js`, `index.html`, `style.css`: the UI
- `server.js`: static file server plus the WebSocket room server

If a player disconnects mid-game, a bot plays their seat until they reconnect. Refreshing the page rejoins the same seat.
