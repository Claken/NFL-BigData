export default function TeamLogo({ team }: { team: string }) {
  return (
    <img
      className="team-logo"
      src={`${import.meta.env.BASE_URL}teams/${team === "LAR" ? "LA" : team}.png`}
      alt=""
      width="40"
      height="40"
      decoding="async"
    />
  );
}
