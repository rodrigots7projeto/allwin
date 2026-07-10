import MotorClient from "./MotorClient";

const SIMBOLOS = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","LTC","DOT","MATIC"];

export function generateStaticParams() {
  return SIMBOLOS.map((simbolo) => ({ simbolo }));
}

export default function MotorPage() {
  return <MotorClient />;
}
