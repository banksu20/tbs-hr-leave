/** Fields rendered by the local LINE-card previews. */
export interface FlexBlockData {
 type: string;
 style?: string;
 color?: string;
 action?: {label?: string};
 size?: string;
 weight?: string;
 text?: string;
 spacing?: string;
 paddingAll?: string | number;
 backgroundColor?: string;
 cornerRadius?: string | number;
 contents?: FlexBlockData[];
}
