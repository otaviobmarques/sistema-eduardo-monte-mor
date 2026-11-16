import 'server-only';
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

Font.registerHyphenationCallback((palavra) => [palavra]);

// Layout Auto Visão (DS 1.1): faixa vermelha, grafite, tabela com cabeçalho grafite e zebra
const C = { grafite: '#373435', impacto: '#151415', texto2: '#696267', divisor: '#DED8DC', superficie: '#F6F4F5', vermelho: '#ED3237', acao: '#C9232C' };
const s = StyleSheet.create({
  pagina: { paddingTop: 34, paddingBottom: 54, paddingHorizontal: 34, fontSize: 9, fontFamily: 'Helvetica', color: C.grafite },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: C.vermelho, marginBottom: 16 },
  logo: { width: 140, height: 140 / 4.3207 },
  sistema: { fontSize: 8, color: C.texto2, textAlign: 'right' },
  kicker: { fontSize: 8, color: C.acao, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase' },
  titulo: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.impacto, marginTop: 2 },
  bloco: { flexDirection: 'row', gap: 12, marginTop: 12, marginBottom: 16 },
  cliente: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: C.divisor, borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoCli: { width: 70, height: 40, objectFit: 'contain' },
  rot: { fontSize: 7, color: C.texto2, textTransform: 'uppercase', marginBottom: 2 },
  nome: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.impacto },
  total: { width: 190, backgroundColor: C.impacto, borderRadius: 8, padding: 12, color: '#FFFFFF' },
  totalVal: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', marginTop: 2 },
  totalDet: { fontSize: 8, color: '#D9D4D7', marginTop: 2 },
  cab: { flexDirection: 'row', backgroundColor: C.grafite, color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  linha: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.divisor },
  zebra: { backgroundColor: C.superficie },
  cel: { paddingVertical: 5, paddingHorizontal: 5 },
  placa: { fontFamily: 'Helvetica-Bold', color: C.impacto },
  somatorio: { flexDirection: 'row', backgroundColor: '#ECE8EA', fontFamily: 'Helvetica-Bold' },
  nota: { marginTop: 14, fontSize: 8, color: C.texto2, lineHeight: 1.4 },
  rodape: { position: 'absolute', bottom: 20, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.texto2, borderTopWidth: 0.5, borderTopColor: C.divisor, paddingTop: 6 },
});

const COLS = [
  { t: 'OS', w: 8 }, { t: 'PLACA', w: 11 }, { t: 'VEÍCULO', w: 27 }, { t: 'ABERTURA', w: 11 },
  { t: 'SITUAÇÃO', w: 15 }, { t: 'CONCLUSÃO', w: 12 }, { t: 'VALOR', w: 16, d: true },
];

export interface LinhaExtrato { numero: number; placa: string; veiculo: string; abertura: string; situacao: string; conclusao: string; valor: string }

export async function gerarExtratoPdf(d: {
  logo: Buffer | null; logoCliente: { data: Buffer; format: 'png' | 'jpg' } | null;
  cliente: string; cnpj: string; loja: string; contatoLoja: string; geradoEm: string;
  total: string; qtd: number; linhas: LinhaExtrato[];
}) {
  const doc = (
    <Document title={`Extrato de placas a pagar · ${d.cliente}`} author="Sistema de OS – Auto Visão" language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <View style={s.topo} fixed>
          {d.logo ? <Image src={{ data: d.logo, format: 'png' }} style={s.logo} /> : <Text style={s.nome}>Auto Visão</Text>}
          <View><Text style={s.sistema}>Sistema de OS – Auto Visão</Text><Text style={s.sistema}>{d.loja}</Text><Text style={s.sistema}>Gerado em {d.geradoEm}</Text></View>
        </View>
        <Text style={s.kicker}>Financeiro</Text>
        <Text style={s.titulo}>Extrato de placas a pagar</Text>
        <View style={s.bloco}>
          <View style={s.cliente}>
            {d.logoCliente && <Image src={d.logoCliente} style={s.logoCli} />}
            <View>
              <Text style={s.rot}>Cliente</Text>
              <Text style={s.nome}>{d.cliente}</Text>
              {d.cnpj ? <Text style={{ color: C.texto2, marginTop: 2 }}>CNPJ {d.cnpj}</Text> : null}
            </View>
          </View>
          <View style={s.total}>
            <Text style={[s.rot, { color: '#D9D4D7' }]}>Total a pagar</Text>
            <Text style={s.totalVal}>{d.total}</Text>
            <Text style={s.totalDet}>{d.qtd === 1 ? '1 placa em aberto' : `${d.qtd} placas em aberto`}</Text>
          </View>
        </View>
        <View style={s.cab} fixed>
          {COLS.map((c) => <Text key={c.t} style={[s.cel, { width: `${c.w}%`, textAlign: c.d ? 'right' : 'left' }]}>{c.t}</Text>)}
        </View>
        {d.linhas.length === 0 && <Text style={[s.cel, { color: C.texto2 }]}>Nenhuma placa em aberto.</Text>}
        {d.linhas.map((l, i) => {
          const v = [String(l.numero), l.placa, l.veiculo, l.abertura, l.situacao, l.conclusao, l.valor];
          return (
            <View key={l.numero} style={[s.linha, i % 2 ? s.zebra : {}]} wrap={false}>
              {v.map((x, j) => <Text key={j} style={[s.cel, { width: `${COLS[j].w}%`, textAlign: COLS[j].d ? 'right' : 'left' }, j === 1 ? s.placa : {}]}>{x}</Text>)}
            </View>
          );
        })}
        <View style={s.somatorio} wrap={false}>
          <Text style={[s.cel, { width: '84%' }]}>TOTAL A PAGAR · {d.qtd} {d.qtd === 1 ? 'placa' : 'placas'}</Text>
          <Text style={[s.cel, { width: '16%', textAlign: 'right' }]}>{d.total}</Text>
        </View>
        <Text style={s.nota}>
          Placas com pagamento em aberto (vistoriadas, a vistoriar e frustradas), exceto as canceladas. Valores das placas ainda
          em andamento podem mudar até a conclusão (deslocamento ou ajuste aprovado). Dúvidas: {d.contatoLoja}.
        </Text>
        <View style={s.rodape} fixed>
          <Text>Extrato de placas a pagar · {d.cliente} · Sistema Domma Tecnologia · Site desenvolvido por Agência RedBox</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
