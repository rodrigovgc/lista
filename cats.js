const CATS = ["Hortifruti","Padaria","Carnes e peixes","Laticínios e ovos","Pratos prontos","Mercearia","Temperos e molhos","Bebidas","Snacks e doces","Congelados","Limpeza","Higiene","Outros"];
// Ordered rules: first match wins. "=x" means whole word, otherwise word prefix.
const CAT_RULES = [
  ["congelad","Congelados"],["picole","Congelados"],["sorvete","Congelados"],["=gelo","Congelados"],["pizza","Congelados"],
  ["almoco","Pratos prontos"],["janta","Pratos prontos"],["pronto","Pratos prontos"],["=sopa","Pratos prontos"],["lasanha","Pratos prontos"],
  ["extrato","Mercearia"],["amendoim","Mercearia"],
  ["lays","Snacks e doces"],["chips","Snacks e doces"],["pipoca","Snacks e doces"],["popcorn","Snacks e doces"],["biscoito","Snacks e doces"],["bolacha","Snacks e doces"],["choco","Snacks e doces"],["macarron","Snacks e doces"],["macaron","Snacks e doces"],["doce","Snacks e doces"],["=bala","Snacks e doces"],["bombom","Snacks e doces"],["cookie","Snacks e doces"],["sobremesa","Snacks e doces"],["nutella","Snacks e doces"],["barrinha","Snacks e doces"],
  ["higienico","Higiene"],["dente","Higiene"],["dental","Higiene"],["lenco","Higiene"],["sabonete","Higiene"],["escova","Higiene"],["shampoo","Higiene"],["xampu","Higiene"],["condicionador","Higiene"],["desodorante","Higiene"],["absorvente","Higiene"],["cotonete","Higiene"],["algodao","Higiene"],["=pasta","Higiene"],
  ["sanitaria","Limpeza"],["detergente","Limpeza"],["persil","Limpeza"],["sabao","Limpeza"],["amaciante","Limpeza"],["saco","Limpeza"],["lixo","Limpeza"],["papel","Limpeza"],["esponja","Limpeza"],["desinfetante","Limpeza"],["alvejante","Limpeza"],["limpa","Limpeza"],
  ["=pao","Padaria"],["paes","Padaria"],["baguete","Padaria"],["croissant","Padaria"],["=bolo","Padaria"],["torrada","Padaria"],["tortilla","Padaria"],["wrap","Padaria"],["brioche","Padaria"],
  ["pimentao","Hortifruti"],
  ["pimenta","Temperos e molhos"],["paprica","Temperos e molhos"],["paprika","Temperos e molhos"],["=sal","Temperos e molhos"],["oregano","Temperos e molhos"],["louro","Temperos e molhos"],["tempero","Temperos e molhos"],["caldo","Temperos e molhos"],["curry","Temperos e molhos"],["cominho","Temperos e molhos"],["canela","Temperos e molhos"],["molho","Temperos e molhos"],["shoyu","Temperos e molhos"],["ketchup","Temperos e molhos"],["mostarda","Temperos e molhos"],["maionese","Temperos e molhos"],["vinagre","Temperos e molhos"],
  ["carne","Carnes e peixes"],["frango","Carnes e peixes"],["peito","Carnes e peixes"],["=file","Carnes e peixes"],["bife","Carnes e peixes"],["linguica","Carnes e peixes"],["salsicha","Carnes e peixes"],["camarao","Carnes e peixes"],["tilapia","Carnes e peixes"],["salmao","Carnes e peixes"],["peixe","Carnes e peixes"],["bacalhau","Carnes e peixes"],["=peru","Carnes e peixes"],["porco","Carnes e peixes"],["costela","Carnes e peixes"],["hamburguer","Carnes e peixes"],["picanha","Carnes e peixes"],["coxa","Carnes e peixes"],["sobrecoxa","Carnes e peixes"],["bacon","Carnes e peixes"],
  ["leite","Laticínios e ovos"],["iogurte","Laticínios e ovos"],["skyr","Laticínios e ovos"],["queijo","Laticínios e ovos"],["cottage","Laticínios e ovos"],["requeijao","Laticínios e ovos"],["manteiga","Laticínios e ovos"],["creme","Laticínios e ovos"],["=nata","Laticínios e ovos"],["=ovo","Laticínios e ovos"],["=ovos","Laticínios e ovos"],["presunto","Laticínios e ovos"],["mussarela","Laticínios e ovos"],["parmesao","Laticínios e ovos"],["kefir","Laticínios e ovos"],["ricota","Laticínios e ovos"],
  ["agua","Bebidas"],["suco","Bebidas"],["=coca","Bebidas"],["refrigerante","Bebidas"],["aquarius","Bebidas"],["cerveja","Bebidas"],["vinho","Bebidas"],["energetico","Bebidas"],["sprite","Bebidas"],["fanta","Bebidas"],["kombucha","Bebidas"],["ice tea","Bebidas"],
  ["arroz","Mercearia"],["feijao","Mercearia"],["macarrao","Mercearia"],["massa","Mercearia"],["aveia","Mercearia"],["granola","Mercearia"],["cereal","Mercearia"],["farinha","Mercearia"],["acucar","Mercearia"],["adocante","Mercearia"],["cafe","Mercearia"],["=cha","Mercearia"],["geleia","Mercearia"],["=mel","Mercearia"],["azeite","Mercearia"],["oleo","Mercearia"],["atum","Mercearia"],["sardinha","Mercearia"],["grao","Mercearia"],["lentilha","Mercearia"],["psyllium","Mercearia"],["cuscuz","Mercearia"],["tapioca","Mercearia"],["chia","Mercearia"],
  ["banana","Hortifruti"],["uva","Hortifruti"],["maca","Hortifruti"],["laranja","Hortifruti"],["limao","Hortifruti"],["morango","Hortifruti"],["framboesa","Hortifruti"],["berries","Hortifruti"],["mirtilo","Hortifruti"],["=pera","Hortifruti"],["abacaxi","Hortifruti"],["manga","Hortifruti"],["melancia","Hortifruti"],["melao","Hortifruti"],["kiwi","Hortifruti"],["peach","Hortifruti"],["pessego","Hortifruti"],["ameixa","Hortifruti"],["tomate","Hortifruti"],["alface","Hortifruti"],["rucula","Hortifruti"],["espinafre","Hortifruti"],["couve","Hortifruti"],["brocolis","Hortifruti"],["cenoura","Hortifruti"],["cebol","Hortifruti"],["alho","Hortifruti"],["batata","Hortifruti"],["abobora","Hortifruti"],["abobrinha","Hortifruti"],["pepino","Hortifruti"],["beterraba","Hortifruti"],["rabanete","Hortifruti"],["legume","Hortifruti"],["fruta","Hortifruti"],["salsa","Hortifruti"],["coentro","Hortifruti"],["gengibre","Hortifruti"],["cogumelo","Hortifruti"],["abacate","Hortifruti"],["avocado","Hortifruti"],["berinjela","Hortifruti"],["vagem","Hortifruti"],["aspargo","Hortifruti"],["mamao","Hortifruti"],["melao","Hortifruti"]
];
function norm(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();}
function guessCat(name){
  const words = norm(name).split(/[^a-z0-9+]+/).filter(Boolean);
  for (const [k,c] of CAT_RULES){
    if (k[0]==="="){ if (words.includes(k.slice(1))) return c; }
    else if (k.includes(" ")){ if (norm(name).includes(k)) return c; }
    else if (words.some(w=>w.startsWith(k))) return c;
  }
  return "Outros";
}

const CAT_EMOJI = {"Hortifruti":"🥬","Padaria":"🥖","Carnes e peixes":"🥩","Laticínios e ovos":"🥛","Pratos prontos":"🍱","Mercearia":"🥫","Temperos e molhos":"🧂","Bebidas":"🥤","Snacks e doces":"🍪","Congelados":"🧊","Limpeza":"🧽","Higiene":"🧴","Outros":"🛒"};
const EMOJI_RULES = [
  ["amendoim","🥜"],["extrato","🥫"],["molho","🥫"],["ketchup","🍅"],["lays","🥔"],["chips","🥔"],["pipoca","🍿"],["popcorn","🍿"],["biscoito","🍪"],["bolacha","🍪"],["choco","🍫"],
  ["picole","🍦"],["sorvete","🍨"],["higienico","🧻"],["toalha","🧻"],["lenco","🧻"],["sabonete","🧼"],["dente","🪥"],["=pasta","🪥"],["shampoo","🧴"],["detergente","🧽"],["esponja","🧽"],["persil","🧺"],["amaciante","🧺"],
  ["=pao","🍞"],["baguete","🥖"],["croissant","🥐"],["almoco","🍱"],["=sopa","🍲"],["pizza","🍕"],
  ["carne","🥩"],["bife","🥩"],["frango","🍗"],["peito","🍗"],["coxa","🍗"],["camarao","🍤"],["tilapia","🐟"],["peixe","🐟"],["salmao","🐟"],["bacon","🥓"],["salsicha","🌭"],
  ["=ovo","🥚"],["=ovos","🥚"],["leite","🥛"],["iogurte","🥛"],["skyr","🥛"],["queijo","🧀"],["cottage","🧀"],["manteiga","🧈"],
  ["arroz","🍚"],["feijao","🫘"],["macarrao","🍝"],["massa","🍝"],["aveia","🌾"],["cafe","☕"],["=cha","🍵"],["geleia","🍯"],["=mel","🍯"],["azeite","🫒"],["=sal","🧂"],["pimentao","🫑"],["pimenta","🌶️"],["paprica","🌶️"],["paprika","🌶️"],
  ["agua","💧"],["coca","🥤"],["refrigerante","🥤"],["aquarius","🥤"],["suco","🧃"],["cerveja","🍺"],["vinho","🍷"],
  ["banana","🍌"],["uva","🍇"],["=maca","🍎"],["macas","🍎"],["laranja","🍊"],["limao","🍋"],["morango","🍓"],["framboesa","🍓"],["berries","🫐"],["mirtilo","🫐"],["=pera","🍐"],["abacaxi","🍍"],["manga","🥭"],["melancia","🍉"],["melao","🍈"],["kiwi","🥝"],["peach","🍑"],["pessego","🍑"],["tomate","🍅"],["alface","🥬"],["espinafre","🥬"],["couve","🥬"],["brocolis","🥦"],["cenoura","🥕"],["cebolinha","🌿"],["cebola","🧅"],["alho","🧄"],["batata","🥔"],["abobora","🎃"],["pepino","🥒"],["milho","🌽"],["abacate","🥑"],["avocado","🥑"],["cogumelo","🍄"],["gengibre","🫚"],["fruta","🍎"],["legume","🥕"],["salsa","🌿"],["coentro","🌿"],["lixo","🗑️"],["saco","🗑️"]
];
function guessEmoji(name, cat){
  const words = norm(name).split(/[^a-z0-9+]+/).filter(Boolean);
  for (const [k,e] of EMOJI_RULES){
    if (k[0]==="="){ if (words.includes(k.slice(1))) return e; }
    else if (words.some(w=>w.startsWith(k))) return e;
  }
  return CAT_EMOJI[cat] || "🛒";
}
